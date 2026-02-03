'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Eye, Heart, ShoppingCart, ExternalLink, Package, ChevronLeft, ChevronRight } from 'lucide-react';

interface Product {
  id: number;
  productId: string;
  name: string;
  images: string[];
  marketplaceStatus: string;
  publishedAt?: string;
  // Real marketplace metrics from UserActivity
  views: number;
  favorites: number;
  addedToCart: number;
  sales: number;
  variantOptions?: {
    sellingPrice: string;
  }[];
}

interface ProductsListProps {
  products: Product[];
}

export default function ProductsList({ products }: ProductsListProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 4;

  // Filter only published products
  const publishedProducts = products.filter(
    (p) => p.marketplaceStatus === 'Published'
  );

  // Calculate pagination
  const totalPages = Math.ceil(publishedProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentProducts = publishedProducts.slice(startIndex, endIndex);

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  if (publishedProducts.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="text-center">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No Published Products
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            You haven't published any products to the marketplace yet.
          </p>
          <Link
            href="/products"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors text-sm font-medium"
          >
            Go to Products
            <ExternalLink className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Published Products
          </h2>
          <p className="text-sm text-gray-600">
            {publishedProducts.length} product{publishedProducts.length !== 1 ? 's' : ''} live on marketplace
          </p>
        </div>
        <Link
          href="/products"
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-[#0a61d7] hover:text-[#084ba6] transition-colors"
        >
          Manage in Products
          <ExternalLink className="w-4 h-4" />
        </Link>
      </div>

      {/* Products Grid */}
      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {currentProducts.map((product) => {
            // Get price from first variant option with defensive parsing
            const rawPrice = product.variantOptions?.[0]?.sellingPrice || '0';
            const parsed = parseFloat(rawPrice);
            const price = Number.isFinite(parsed) ? parsed : 0;
            
            return (
              <div
                key={product.id}
                className="group border border-gray-100 rounded-lg p-3 hover:shadow-md transition-all hover:border-[#0a61d7]"
              >
                {/* Product Image */}
                <div className="relative w-full aspect-square mb-3 bg-gray-50 rounded-lg overflow-hidden">
                  {product.images && product.images.length > 0 ? (
                    <Image
                      src={product.images[0]}
                      alt={product.name}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-12 h-12 text-gray-300" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                      Live
                    </span>
                  </div>
                </div>

                {/* Product Info */}
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1 line-clamp-2 group-hover:text-[#0a61d7] transition-colors">
                    {product.name}
                  </h3>
                  <p className="text-sm font-bold text-[#0a61d7]">
                    Rp {price.toLocaleString('id-ID')}
                  </p>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="flex flex-col items-center p-2 bg-gray-50 rounded">
                    <Eye className="w-4 h-4 text-gray-400 mb-1" />
                    <span className="text-xs font-semibold text-gray-900">
                      {product.views}
                    </span>
                    <span className="text-xs text-gray-500">views</span>
                  </div>
                  <div className="flex flex-col items-center p-2 bg-gray-50 rounded">
                    <Heart className="w-4 h-4 text-gray-400 mb-1" />
                    <span className="text-xs font-semibold text-gray-900">
                      {product.favorites}
                    </span>
                    <span className="text-xs text-gray-500">likes</span>
                  </div>
                  <div className="flex flex-col items-center p-2 bg-gray-50 rounded">
                    <ShoppingCart className="w-4 h-4 text-gray-400 mb-1" />
                    <span className="text-xs font-semibold text-gray-900">
                      {product.sales}
                    </span>
                    <span className="text-xs text-gray-500">sales</span>
                  </div>
                </div>

                {/* View Details Link */}
                <Link
                  href={`/products/catalog/${product.productId}`}
                  className="block text-center text-xs font-medium text-[#0a61d7] hover:text-[#084ba6] transition-colors"
                >
                  View Details →
                </Link>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4 px-4 py-3 border-t border-gray-200">
        <div className="text-sm text-gray-500">
          Showing {startIndex + 1} to {Math.min(endIndex, publishedProducts.length)} of {publishedProducts.length} results
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevPage}
            disabled={currentPage === 1}
            aria-label="Previous page"
            className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          
          <div className="flex items-center gap-1">
            {/* Sliding window pagination */}
            {(() => {
              const windowSize = 5;
              const startPage = Math.max(1, currentPage - 2);
              const endPage = Math.min(totalPages, startPage + windowSize - 1);
              
              // Adjust startPage if we're near the end
              const adjustedStartPage = Math.max(1, Math.min(startPage, totalPages - windowSize + 1));
              
              const pages = [];
              
              // Show first page + ellipsis if not in window
              if (adjustedStartPage > 1) {
                pages.push(
                  <button
                    key={1}
                    onClick={() => setCurrentPage(1)}
                    className="px-3 py-2 text-sm rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  >
                    1
                  </button>
                );
                if (adjustedStartPage > 2) {
                  pages.push(
                    <span key="leading-ellipsis" className="px-2 text-gray-500">
                      ...
                    </span>
                  );
                }
              }
              
              // Show window of pages
              for (let i = adjustedStartPage; i <= endPage; i++) {
                pages.push(
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i)}
                    className={`px-3 py-2 text-sm rounded-lg ${
                      currentPage === i
                        ? 'bg-[#0a61d7] text-white'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {i}
                  </button>
                );
              }
              
              // Show ellipsis + last page if not in window
              if (endPage < totalPages) {
                if (endPage < totalPages - 1) {
                  pages.push(
                    <span key="trailing-ellipsis" className="px-2 text-gray-500">
                      ...
                    </span>
                  );
                }
                pages.push(
                  <button
                    key={totalPages}
                    onClick={() => setCurrentPage(totalPages)}
                    className={`px-3 py-2 text-sm rounded-lg ${
                      currentPage === totalPages
                        ? 'bg-[#0a61d7] text-white'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {totalPages}
                  </button>
                );
              }
              
              return pages;
            })()}
          </div>
          
          <button
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
            aria-label="Next page"
            className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
