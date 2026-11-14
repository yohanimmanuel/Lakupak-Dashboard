'use client';

import React from 'react';
import {
  DollarSign, Tag, Upload, Plus, X, Loader2, CheckCircle, Info, ArrowLeft,
  Package, Gift, RefreshCw, ChevronUp, ChevronDown, Download, Search,
} from 'lucide-react';
import Link from 'next/link';
import VariationListImport from '@/components/productscatalogs/VariationListImport';
import ImportVariantModal from '@/components/productscatalogs/ImportVariantModal';
import StockLevelConversion from '@/components/productscatalogs/StockLevelConversion';
import PricingAnchorConfiguration from '@/components/productscatalogs/PricingAnchorConfiguration';
import { getCategoryImageSrc, getCategoryIconComponent } from '@/utils/categoryUtils';
import { getProductStockStatus, getVariantStockStatus, getWholeStockQuantity, getStockLevelFractionLabel, updateStockFromWholeQuantity, validateStockLevels } from '@/utils/stockUtils';
import { formatCurrencyAmount } from '@/utils/currencyUtils';
import { parseNumberByCurrency, getPricePlaceholder } from '@/config/currencyConfig';
import { getProductCompletion } from '@/utils/productCompletion';
import type { useProductCatalogController } from './useProductCatalogController';

function CategoryTypeGlyph({ value, color }: { value: string; color?: string }) {
  const imageSrc = getCategoryImageSrc(value);
  if (imageSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageSrc} alt="" className="h-5 w-5 object-contain" />
    );
  }
  const IconComponent = getCategoryIconComponent(value);
  return (
    <span style={{ color }}>
      <IconComponent className="h-4 w-4" />
    </span>
  );
}

type ProductCatalogViewProps = ReturnType<typeof useProductCatalogController>;

export default function ProductCatalogView(props: ProductCatalogViewProps) {
  const {
    CATALOG_COMPLETION_OPTIONS,
    PRODUCT_REQUIRED_TEXT,
    VARIATION_COL_WEIGHTS,
    VARIATION_ROW_MIN,
    activeStockLevels,
    addStockLevel,
    addVariant,
    addVariantOption,
    availableCategories,
    beginVariationColResize,
    catalogCategoryRef,
    clearAllImages,
    combinations,
    commitStockLevelRatioDraft,
    commitVariantOptionRename,
    commitVariantTypeRename,
    convertLegacyStockToPieces,
    currencySymbol,
    currentMode,
    currentProductStatus,
    customOfferClientCount,
    displayStockLevels,
    fieldErrors,
    filteredSupplierOptions,
    formData,
    generalCategoryRef,
    getSelectedCategory,
    guardVariantOptionEditOnFocus,
    guardVariantTypeEditOnFocus,
    handleCancel,
    handleCategorySelect,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleExportVariationList,
    handleFileInput,
    handleInputChange,
    handleSubmit,
    handleSubmitWithStatus,
    handleUnpublish,
    handleVariationImport,
    hasUnsavedChanges,
    isDragOver,
    isOfferConnected,
    isViewMode,
    legacyConversionError,
    legacyPiecesPerUnit,
    legacyStockUnit,
    marketSegmentOptions,
    marketSegmentRef,
    parseNumberByCurrency,
    product,
    productControlClass,
    removeImage,
    removeStockLevel,
    removeVariant,
    removeVariantOption,
    reorderImages,
    router,
    saving,
    setCombinations,
    setLegacyConversionError,
    setLegacyPiecesPerUnit,
    setShowCatalogCategoryDropdown,
    setShowGeneralCategoryDropdown,
    setShowImportStockSetup,
    setShowMarketSegmentDropdown,
    setShowSupplierDropdown,
    setShowVariationImport,
    setStockLevelRatioDrafts,
    setSupplierSearch,
    setVariantGuardModal,
    setVariants,
    setVariationRefreshTick,
    setVariationRowHeights,
    showCatalogCategoryDropdown,
    showGeneralCategoryDropdown,
    showImportStockSetup,
    showMarketSegmentDropdown,
    showSuccessModal,
    showSupplierDropdown,
    showVariationImport,
    stockLevelRatioDrafts,
    stockSummary,
    supplierDropdownRef,
    supplierOptions,
    supplierSearch,
    tCatalog,
    tShared,
    trackVariationSizeDrag,
    translateCategory,
    translateFieldName,
    translateStatus,
    translateStockStatus,
    updateCombination,
    updateStockLevel,
    updateStockLevelRatioValue,
    updatePriceAnchor,
    updateVariant,
    updateVariantOption,
    uploadingImages,
    userCurrency,
    validateNumericInput,
    variantDrafts,
    variantGuardModal,
    variants,
    variationColStyle,
    variationImportColumns,
    variationRowHeight,
    variationTablePixelWidth,
    variationTableRef,
  } = props;
  return (
    <div className="w-full mx-auto bg-white rounded-lg border border-[#e6e6e6]">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-[#e6e6e6] p-4 @5xl/main:flex-row @5xl/main:items-center @5xl/main:justify-between">
        <div className="flex min-w-0 flex-col gap-3 @3xl/main:flex-row @3xl/main:items-center">
          <button
            onClick={() => {
              if (currentMode === 'edit' && hasUnsavedChanges) {
                if (confirm(tCatalog('header.confirmLeave'))) {
                  router.push('/products/list');
                }
              } else {
                router.push('/products/list');
              }
            }}
            className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 @3xl/main:w-auto @3xl/main:justify-start"
          >
            <ArrowLeft className="h-4 w-4" />
            {tCatalog('header.back')}
          </button>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-bold text-gray-900">
              {currentMode === 'add' && tCatalog('header.addNewProduct')}
              {currentMode === 'view' && tCatalog('header.productDetails')}
              {currentMode === 'edit' && tCatalog('header.editProduct')}
            </h1>
            {currentMode === 'view' && currentProductStatus === 'Published' && (
              <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-600">
                {translateStatus('Published')}
              </span>
            )}
            {customOfferClientCount > 0 && (
              <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700">
                {tShared.has('customOfferClients')
                  ? tShared('customOfferClients', { count: String(customOfferClientCount) })
                  : `${customOfferClientCount} clients have custom rates`}
              </span>
            )}
            {currentMode === 'edit' && hasUnsavedChanges && (
              <span className="text-sm font-medium text-orange-600">• {tCatalog('header.unsavedChanges')}</span>
            )}
          </div>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 @4xl/main:flex-row @4xl/main:flex-wrap @4xl/main:items-center @5xl/main:w-auto">
          {currentMode === 'view' && currentProductStatus === 'Published' && (
            <>
              <button
                type="button"
                onClick={handleUnpublish}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50 @4xl/main:w-auto"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    {tCatalog('header.delisting')}
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4" />
                    {tCatalog('header.unpublish')}
                  </>
                )}
              </button>
            </>
          )}
          {currentMode === 'add' && (
            <>
              <button
                type="button"
                onClick={() => router.push('/products/list')}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-black disabled:cursor-not-allowed disabled:opacity-50 @4xl/main:w-auto"
              >
                <X className="h-4 w-4" />
                {tCatalog('header.cancel')}
              </button>
              <button
                type="button"
                onClick={() => handleSubmitWithStatus('Draft')}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#0a61d7] bg-white px-4 py-2 text-sm font-semibold text-[#0a61d7] transition hover:bg-[#f7faff] disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-gray-100 @4xl/main:w-auto"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? tCatalog('header.saving') : tCatalog('header.saveDraft')}
              </button>
              <button
                type="submit"
                form="product-form"
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0a61d7] px-4 py-2 font-semibold text-white transition-colors hover:bg-[#0851b8] disabled:cursor-not-allowed disabled:opacity-50 @4xl/main:w-auto"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    {tCatalog('header.saving')}
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    {tCatalog('header.saveAndPublish')}
                  </>
                )}
              </button>
            </>
          )}
          {currentMode === 'edit' && currentProductStatus !== 'Published' && (
            <>
              <button
                type="button"
                onClick={handleCancel}
                disabled={!hasUnsavedChanges || saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-black disabled:cursor-not-allowed disabled:opacity-50 @4xl/main:w-auto"
              >
                <X className="h-4 w-4" />
                {tCatalog('header.cancel')}
              </button>
              <button
                type="button"
                onClick={() => handleSubmitWithStatus('Draft')}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#0a61d7] bg-white px-4 py-2 text-sm font-semibold text-[#0a61d7] transition hover:bg-[#f7faff] disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:hover:bg-gray-100 @4xl/main:w-auto"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? tCatalog('header.saving') : tCatalog('header.saveDraft')}
              </button>
              <button
                type="submit"
                form="product-form"
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0a61d7] px-4 py-2 font-semibold text-white transition-colors hover:bg-[#084ba6] disabled:cursor-not-allowed disabled:opacity-50 @4xl/main:w-auto"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    {tCatalog('header.saving')}
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    {tCatalog('header.saveAndPublish')}
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mode Descriptions */}
      <div className="px-4 py-3 bg-gray-50 border-b border-[#e6e6e6]">
        {currentMode === 'add' && (
          <p className="text-sm text-gray-600">
            {tCatalog('modeDescriptions.add')}
          </p>
        )}
        {currentMode === 'view' && (
          <>
            <p className="text-sm text-gray-600">
              {tCatalog('modeDescriptions.view')}
            </p>
            {currentProductStatus === 'Published' && (
              <div className="mt-2 flex gap-2 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg">
                <Info className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
                <span className="text-sm text-orange-700 font-medium">
                  {tCatalog('header.unpublishHint')}
                </span>
              </div>
            )}
          </>
        )}
        {currentMode === 'edit' && (
          <p className="text-sm text-gray-600">
            {tCatalog('modeDescriptions.edit')}
          </p>
        )}
      </div>

      {/* Profile Completion Progress */}
      {(currentMode === 'view' || currentMode === 'edit' || currentMode === 'add') && (
        <div className="mx-4 mt-4 mb-4 p-4 bg-gradient-to-r from-blue-50 to-amber-50 border border-blue-200 rounded-lg">
          {(() => {
            const completion = getProductCompletion(formData, combinations, userCurrency, CATALOG_COMPLETION_OPTIONS);
            const { completionPercentage, completedCount, totalFields, missingFieldKeys } = completion;
            
            return (
              <>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-800">{tCatalog('completion.title')}</h3>
                  <span className={`text-sm font-bold ${completionPercentage === 100 ? 'text-green-600' : 'text-amber-700'}`}>
                    {completionPercentage}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-300 ${
                      completionPercentage === 100 ? 'bg-green-500' : 'bg-amber-500'
                    }`}
                    style={{ width: `${completionPercentage}%` }}
                  ></div>
                </div>
                <div className="text-xs text-gray-600">
                  {tCatalog('completion.fieldsCompleted', { completed: completedCount, total: totalFields })}
                  {missingFieldKeys.length > 0 && (
                    <span className="ml-2 text-amber-700">
                      • {tCatalog('completion.missing', { fields: missingFieldKeys.map(key => translateFieldName(key)).join(', ') })}
                    </span>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}

      <form id="product-form" onSubmit={handleSubmit} className="p-4">
        {/* 3-Row Layout */}
        <div className="space-y-4">
          
          {/* Row 1: General Information - Full Width */}
          <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
            <h2 className="text-md font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-gray-500" />
              {tCatalog('generalInfo.title')}
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 @3xl/main:grid-cols-2 @5xl/main:grid-cols-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {tCatalog('generalInfo.productId')}
                  </label>
                  <input
                    type="text"
                    value={formData.productId || ''}
                    disabled={true}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                    placeholder={tCatalog('generalInfo.productIdPlaceholder')}
                  />
                  {currentMode === 'add' && (
                    <p className="text-xs text-gray-500 mt-1">{tCatalog('generalInfo.productIdHint')}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {tCatalog('generalInfo.marketSegment')}
                  </label>
                  <div className="relative" ref={marketSegmentRef}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMarketSegmentDropdown((open) => !open);
                        setShowGeneralCategoryDropdown(false);
                        setShowCatalogCategoryDropdown(false);
                      }}
                      disabled={isViewMode}
                      aria-invalid={fieldErrors.marketSegment ? true : undefined}
                      className={`${productControlClass('marketSegment')} text-left flex items-center justify-between`}
                    >
                      <span className={formData.marketSegment ? 'text-black' : 'text-gray-500'}>
                        {formData.marketSegment || tCatalog('generalInfo.selectMarketSegment')}
                      </span>
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    </button>
                    {showMarketSegmentDropdown && !isViewMode && (
                      <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-[#e6e6e6] bg-white shadow-lg">
                        {(() => {
                          const options = [...marketSegmentOptions];
                          const selected = formData.marketSegment.trim();
                          if (selected && !options.some((option) => option.toLowerCase() === selected.toLowerCase())) {
                            options.unshift(selected);
                          }
                          if (options.length === 0) {
                            return (
                              <div className="px-3 py-2 text-xs text-gray-500">
                                {tCatalog('generalInfo.noMarketSegments')}
                              </div>
                            );
                          }
                          return options.map((segment) => (
                            <button
                              key={segment}
                              type="button"
                              onClick={() => {
                                handleInputChange('marketSegment', segment);
                                setShowMarketSegmentDropdown(false);
                              }}
                              className={`block w-full px-3 py-2 text-left text-xs hover:bg-gray-100 ${
                                formData.marketSegment === segment
                                  ? 'font-semibold text-[#0a61d7]'
                                  : 'text-gray-700'
                              }`}
                            >
                              {segment}
                            </button>
                          ));
                        })()}
                      </div>
                    )}
                  </div>
                  {fieldErrors.marketSegment ? (
                    <p className="text-red-500 text-xs mt-1">{fieldErrors.marketSegment}</p>
                  ) : null}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {tCatalog('generalInfo.brand')}<span className="text-red-500 ml-1">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.brand}
                    onChange={(e) => handleInputChange('brand', e.target.value)}
                    disabled={isViewMode}
                    maxLength={PRODUCT_REQUIRED_TEXT.brand.max}
                    aria-invalid={fieldErrors.brand ? true : undefined}
                    className={productControlClass('brand')}
                    placeholder={tCatalog('generalInfo.brandPlaceholder')}
                  />
                  {fieldErrors.brand ? <p className="text-red-500 text-xs mt-1">{fieldErrors.brand}</p> : null}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {tCatalog('generalInfo.type')}<span className="text-red-500 ml-1">*</span>
                  </label>
                  <div className="relative" ref={generalCategoryRef}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowGeneralCategoryDropdown(!showGeneralCategoryDropdown);
                        setShowCatalogCategoryDropdown(false);
                        setShowMarketSegmentDropdown(false);
                      }}
                      disabled={isViewMode}
                      aria-invalid={fieldErrors.productType ? true : undefined}
                      className={`${productControlClass('productType')} text-left flex items-center justify-between`}
                    >
                      <span className="flex items-center gap-2">
                        {formData.productType ? (
                          <>
                            {(() => {
                              const selectedCategory = getSelectedCategory(formData.productType);
                              return (
                                <CategoryTypeGlyph
                                  value={formData.productType}
                                  color={selectedCategory?.color}
                                />
                              );
                            })()}
                            <span className="text-black">{translateCategory(formData.productType)}</span>
                          </>
                        ) : (
                          <span className="text-gray-500">{tCatalog('generalInfo.selectCategory')}</span>
                        )}
                      </span>
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    </button>
                    
                    {showGeneralCategoryDropdown && !isViewMode && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-[#e6e6e6] rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {availableCategories.map((category) => {
                          return (
                            <button
                              key={category.value}
                              type="button"
                              onClick={() => handleCategorySelect(category.value, 'productType')}
                              className="w-full px-3 py-2 text-xs text-left hover:bg-gray-100 flex items-center gap-2"
                            >
                              <CategoryTypeGlyph value={category.value} color={category.color} />
                              <span className="text-black">{translateCategory(category.value)}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {fieldErrors.productType ? <p className="text-red-500 text-xs mt-1">{fieldErrors.productType}</p> : null}
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {tCatalog('generalInfo.productName')}<span className="text-red-500 ml-1">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    disabled={isViewMode}
                    maxLength={PRODUCT_REQUIRED_TEXT.name.max}
                    aria-invalid={fieldErrors.name ? true : undefined}
                    className={productControlClass('name')}
                    placeholder={tCatalog('generalInfo.productNamePlaceholder')}
                  />
                  {fieldErrors.name ? <p className="text-red-500 text-xs mt-1">{fieldErrors.name}</p> : null}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {tCatalog('generalInfo.supplier')}<span className="text-red-500 ml-1">*</span>
                  </label>
                  <div className="relative" ref={supplierDropdownRef}>
                    <button
                      type="button"
                      onClick={() => {
                        if (isViewMode) return;
                        setShowSupplierDropdown((open) => !open);
                        setShowGeneralCategoryDropdown(false);
                        setShowCatalogCategoryDropdown(false);
                        setShowMarketSegmentDropdown(false);
                      }}
                      disabled={isViewMode}
                      aria-invalid={fieldErrors.supplier ? true : undefined}
                      className={`${productControlClass('supplier')} text-left flex items-center justify-between`}
                    >
                      <span className={formData.supplier ? 'text-black truncate' : 'text-gray-500'}>
                        {formData.supplier || tCatalog('generalInfo.supplierMatchPlaceholder')}
                      </span>
                      <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    </button>
                    {showSupplierDropdown && !isViewMode && (
                      <div className="absolute z-50 mt-1 w-full rounded-lg border border-[#e6e6e6] bg-white shadow-lg">
                        <div className="border-b border-[#e6e6e6] p-2">
                          <div className="flex items-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-2 py-1.5">
                            <Search className="h-3.5 w-3.5 text-gray-400" />
                            <input
                              type="text"
                              value={supplierSearch}
                              onChange={(e) => setSupplierSearch(e.target.value)}
                              placeholder={tCatalog('generalInfo.supplierSearchPlaceholder')}
                              className="w-full bg-transparent text-xs text-black outline-none placeholder:text-gray-400"
                              autoFocus
                            />
                          </div>
                        </div>
                        <div className="max-h-56 overflow-y-auto">
                          {filteredSupplierOptions.length === 0 ? (
                            <div className="px-3 py-3 text-xs text-gray-500">
                              {supplierOptions.length === 0 ? (
                                <>
                                  {tCatalog('generalInfo.supplierEmpty')}{' '}
                                  <Link
                                    href="/clients/suppliers"
                                    className="font-semibold text-[#0a61d7] hover:underline"
                                  >
                                    {tCatalog('generalInfo.supplierEmptyLink')}
                                  </Link>
                                </>
                              ) : (
                                tCatalog('generalInfo.supplierNoMatch')
                              )}
                            </div>
                          ) : (
                            filteredSupplierOptions.map((row) => (
                              <button
                                key={row.supplierId || row.name}
                                type="button"
                                onClick={() => {
                                  handleInputChange('supplier', row.name);
                                  setShowSupplierDropdown(false);
                                  setSupplierSearch('');
                                }}
                                className={`block w-full px-3 py-2 text-left text-xs hover:bg-gray-100 ${
                                  formData.supplier === row.name
                                    ? 'font-semibold text-[#0a61d7]'
                                    : 'text-gray-700'
                                }`}
                              >
                                {row.name}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {fieldErrors.supplier ? <p className="text-red-500 text-xs mt-1">{fieldErrors.supplier}</p> : null}
                  {!fieldErrors.supplier ? (
                    <p className="text-xs text-gray-500 mt-1">
                      {tCatalog('generalInfo.supplierAutoSyncNote')}
                    </p>
                  ) : null}
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  {tCatalog('generalInfo.productDescription')}<span className="text-red-500 ml-1">*</span>
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  disabled={isViewMode}
                  maxLength={PRODUCT_REQUIRED_TEXT.description.max}
                  aria-invalid={fieldErrors.description ? true : undefined}
                  rows={3}
                  className={productControlClass('description')}
                  placeholder={tCatalog('generalInfo.productDescriptionPlaceholder')}
                />
                {fieldErrors.description ? <p className="text-red-500 text-xs mt-1">{fieldErrors.description}</p> : null}
              </div>

              {/* Product Assurance */}
              <div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <label className="flex items-center gap-2 text-xs text-gray-700">
                    <button
                      type="button"
                      disabled={isViewMode}
                      onClick={() => handleInputChange('halalCertified', !formData.halalCertified)}
                      className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                        formData.halalCertified
                          ? 'bg-green-500 border-green-500'
                          : 'bg-white border-gray-300 hover:border-green-400'
                      } ${isViewMode ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {formData.halalCertified && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                    <span>{tCatalog('generalInfo.halalCertified')}</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-700">
                    <button
                      type="button"
                      disabled={isViewMode}
                      onClick={() => handleInputChange('bpomApproved', !formData.bpomApproved)}
                      className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                        formData.bpomApproved
                          ? 'bg-green-500 border-green-500'
                          : 'bg-white border-gray-300 hover:border-green-400'
                      } ${isViewMode ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {formData.bpomApproved && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                    <span>{tCatalog('generalInfo.bpomApproved')}</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-700">
                    <button
                      type="button"
                      disabled={isViewMode}
                      onClick={() => handleInputChange('originalProduct', !formData.originalProduct)}
                      className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center ${
                        formData.originalProduct
                          ? 'bg-green-500 border-green-500'
                          : 'bg-white border-gray-300 hover:border-green-400'
                      } ${isViewMode ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {formData.originalProduct && (
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                    <span>{tCatalog('generalInfo.originalProduct')}</span>
                  </label>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">{tCatalog('generalInfo.returnPolicyDays')}</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.returnPolicyDays ?? 7}
                      onChange={(e) => handleInputChange('returnPolicyDays', parseInt(e.target.value) || 0)}
                      disabled={isViewMode}
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                      placeholder={tCatalog('generalInfo.returnPolicyPlaceholder')}
                    />
                  </div>
                </div>
              </div>

              {/* Buy X Get Y Promotion Notice */}
              {product?.promotionDetails && (
                <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-50 ring-1 ring-purple-100">
                      <Gift className="h-4 w-4 text-purple-600" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <h4 className="text-sm font-semibold text-gray-900">
                          {tCatalog('generalInfo.promotionTitle')}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-gray-600">
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5">
                            <span className="text-gray-500">{tCatalog('generalInfo.promotionBuy')}</span>
                            <span className="font-semibold text-gray-900">
                              {tCatalog('generalInfo.promotionBuyItems', { count: product.promotionDetails.minQuantity })}
                            </span>
                          </span>
                          <span className="text-gray-300" aria-hidden>
                            →
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-md border border-purple-100 bg-purple-50 px-2 py-0.5">
                            <span className="text-purple-600">{tCatalog('generalInfo.promotionGetFree')}</span>
                            <span className="font-semibold text-purple-700">
                              {product.promotionDetails.freeQuantity > 1
                                ? tCatalog('generalInfo.promotionFreeItems', { count: product.promotionDetails.freeQuantity })
                                : tCatalog('generalInfo.promotionFreeItem', { count: product.promotionDetails.freeQuantity })}
                            </span>
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        <span className="font-medium text-gray-700">{tCatalog('generalInfo.promotionNoteLabel')}</span>{' '}
                        {product.promotionDetails.freeQuantity > 1
                          ? tCatalog('generalInfo.promotionHintPlural', {
                              minQuantity: product.promotionDetails.minQuantity,
                              freeQuantity: product.promotionDetails.freeQuantity,
                            })
                          : tCatalog('generalInfo.promotionHint', {
                              minQuantity: product.promotionDetails.minQuantity,
                              freeQuantity: product.promotionDetails.freeQuantity,
                            })}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Upload Images (3/4) + Product Settings (1/4) */}
          <div className="grid grid-cols-1 gap-4 @5xl/main:grid-cols-5">
            {/* Upload Images - 3/4 width */}
            <div className="@5xl/main:col-span-3 bg-white rounded-lg border border-[#e6e6e6] p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-md font-semibold text-gray-900 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-gray-500" />
                  {tCatalog('images.title')}
                  <span className="text-red-500">*</span>
                </h2>
                {!isViewMode && formData.images.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAllImages}
                    className="text-xs text-red-500 hover:text-red-700 font-medium"
                  >
                    {tCatalog('images.clearAll')}
                  </button>
                )}
              </div>
              {fieldErrors.images ? <p className="text-red-500 text-xs mb-3">{fieldErrors.images}</p> : null}
              
              <div className="flex gap-4">
                {/* Main Image - Right side */}
                <div className="flex-1">
                  <div 
                    className={`w-full h-64 bg-gray-100 rounded-lg border-2 border-dashed transition-colors ${
                      isDragOver 
                        ? 'border-[#0a61d7] bg-blue-50' 
                        : 'border-gray-300'
                    } flex items-center justify-center relative overflow-hidden`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    {formData.images.length > 0 ? (
                      <div className="relative w-full h-full">
                        <img 
                          src={formData.images[0]} 
                          alt={tCatalog('images.mainProductAlt')} 
                          className="w-full h-full object-cover rounded-lg"
                        />
                        {!isViewMode && (
                          <button
                            type="button"
                            onClick={() => removeImage(0)}
                            className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors z-10"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="text-center">
                        <Upload className={`w-12 h-12 mx-auto mb-2 ${isDragOver ? 'text-[#0a61d7]' : 'text-gray-400'}`} />
                        <p className={`font-medium ${isDragOver ? 'text-[#0a61d7]' : 'text-gray-500'}`}>
                          {isDragOver ? tCatalog('images.dropHere') : tCatalog('images.dragOrClick')}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">{tCatalog('images.supportedFormats')}</p>
                      </div>
                    )}
                    
                    {/* Hidden file input for click upload */}
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleFileInput}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      disabled={isViewMode}
                    />
                  </div>
                </div>
                
                {/* Thumbnail Images - Left side, horizontal */}
                <div className="w-32 space-y-2">
                  <div className="text-xs text-gray-500 mb-2">{tCatalog('images.additionalImages')}</div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {formData.images.slice(1).map((image, index) => (
                      <div 
                        key={index} 
                        className="relative w-28 h-20 bg-gray-100 rounded-lg border border-[#e6e6e6] overflow-hidden cursor-move transition-shadow"
                        draggable={!isViewMode}
                        onDragStart={(e) => {
                          if (!isViewMode) {
                            e.dataTransfer.setData('text/plain', String(index + 1));
                          }
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          if (!isViewMode) {
                            e.preventDefault();
                            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                            const toIndex = index + 1;
                            reorderImages(fromIndex, toIndex);
                          }
                        }}
                      >
                        <img src={image} alt={tCatalog('images.productAlt', { index: index + 2 })} className="w-full h-full object-cover" />
                        {!isViewMode && (
                          <>
                            <button
                              type="button"
                              onClick={() => removeImage(index + 1)}
                              className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                            <div className="absolute bottom-1 left-1 w-5 h-5 bg-gray-800 bg-opacity-70 text-white text-xs rounded-full flex items-center justify-center">
                              {index + 2}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                    
                    {/* Add more images button */}
                    {!isViewMode && formData.images.length < 10 && (
                      <div className="relative">
                        <div className="w-28 h-20 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center hover:border-[#0a61d7] transition-colors">
                          <Plus className="w-6 h-6 text-gray-400" />
                        </div>
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={handleFileInput}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Upload Progress */}
              {uploadingImages && (
                <div className="flex items-center gap-2 text-sm text-gray-600 mt-4">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-[#0a61d7] rounded-full animate-spin"></div>
                  <span>{tCatalog('images.uploading')}</span>
                </div>
              )}
              {/* Image Count Info */}
              <div className="flex items-center justify-between mt-4">
                <div className="text-xs text-gray-500">
                  {tCatalog('images.countUploaded', { count: formData.images.length })}
                </div>
              </div>
            </div>

            {/* Product Settings - 1/4 width */}
            <div className="@5xl/main:col-span-2 bg-white rounded-lg border border-[#e6e6e6] p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-md font-semibold text-gray-900 flex items-center gap-2">
                  <Tag className="w-5 h-5 text-gray-500" />
                  {tCatalog('settings.title')}
                </h2>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {tCatalog('settings.productType')}
                  </label>
                  <div className="relative" ref={catalogCategoryRef}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCatalogCategoryDropdown(!showCatalogCategoryDropdown);
                        setShowGeneralCategoryDropdown(false);
                      }}
                      disabled={isViewMode}
                      className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black text-left flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2">
                        {formData.productType ? (
                          <>
                            {(() => {
                              const selectedCategory = getSelectedCategory(formData.productType);
                              return (
                                <CategoryTypeGlyph
                                  value={formData.productType}
                                  color={selectedCategory?.color}
                                />
                              );
                            })()}
                            <span className="text-black">{translateCategory(formData.productType)}</span>
                          </>
                        ) : (
                          <span className="text-gray-500">{tCatalog('generalInfo.selectCategory')}</span>
                        )}
                      </span>
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    </button>
                    
                    {showCatalogCategoryDropdown && !isViewMode && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-[#e6e6e6] rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {availableCategories.map((category) => {
                          return (
                            <button
                              key={category.value}
                              type="button"
                              onClick={() => handleCategorySelect(category.value, 'productType')}
                              className="w-full px-3 py-2 text-xs text-left hover:bg-gray-100 flex items-center gap-2"
                            >
                              <CategoryTypeGlyph value={category.value} color={category.color} />
                              <span className="text-black">{translateCategory(category.value)}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {tCatalog('generalInfo.marketSegment')}
                  </label>
                  <input
                    type="text"
                    value={formData.marketSegment}
                    disabled
                    readOnly
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg bg-gray-50 text-black cursor-not-allowed"
                    placeholder={tCatalog('generalInfo.selectMarketSegment')}
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    {tCatalog('settings.catalogName')}
                  </label>
                  <input
                    type="text"
                    value={formData.catalogName}
                    onChange={(e) => handleInputChange('catalogName', e.target.value)}
                    disabled={isViewMode}
                    className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                    placeholder={tCatalog('settings.catalogNamePlaceholder')}
                  />
                </div>
                
                <div className="text-xs text-gray-500 italic pt-2 border-t border-[#e6e6e6]">
                  {tCatalog('settings.filterHint')}
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Product Stock Summary - Full Width */}
          <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
            <div className="mb-6">
              <h2 className="text-md font-semibold text-gray-900 flex items-center gap-2 mb-4">
                <Package className="w-5 h-5 text-gray-500" />
                {tCatalog('stockSummary.title')}
                <span className="text-xs text-gray-500 font-normal">{tCatalog('stockSummary.computedFromVariants')}</span>
              </h2>
              
              {/* Product-Level Stock Summary (Read-Only) */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      {tCatalog('stockSummary.totalStock')}
                    </label>
                    <div className="px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white text-gray-900 font-medium">
                      {combinations.reduce((sum, combo) => sum + combo.stockQuantity, 0).toLocaleString()}{' '}
                      <span className="font-normal text-gray-500">
                        {tCatalog(`variants.stockUnits.${legacyStockUnit || 'Pieces'}`)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{tCatalog('stockSummary.totalStockHint')}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      {tCatalog('stockSummary.lowStockThreshold')} ({tCatalog(`variants.stockUnits.${legacyStockUnit || 'Pieces'}`)})
                    </label>
                    <div className="px-3 py-2 text-xs border border-gray-300 rounded-lg bg-white text-gray-900 font-medium">
                      {combinations.reduce((sum, combo) => sum + combo.lowStockThreshold, 0).toLocaleString()}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{tCatalog('stockSummary.lowStockThresholdHint')}</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">
                      {tCatalog('stockSummary.overallStatus')}
                    </label>
                    {(() => {
                      const overallStatus = getProductStockStatus(combinations);
                      return (
                    <div className={`px-3 py-2 text-xs border rounded-lg font-medium ${
                      overallStatus === 'Out of Stock'
                        ? 'bg-red-50 border-red-200 text-red-800'
                        : overallStatus === 'Low Stock'
                        ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
                        : 'bg-green-50 border-green-200 text-green-800'
                    }`}>
                      {translateStockStatus(overallStatus)}
                    </div>
                      );
                    })()}
                    <p className="text-xs text-gray-500 mt-1">{tCatalog('stockSummary.overallStatusHint')}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Product Variants Section */}
            <div className="border-t border-[#e6e6e6] pt-6">
              <div className="mb-4">
                {isOfferConnected && (
                  <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded">
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 text-[#0a61d7]" />
                      <div className="text-xs text-[#0a61d7]">
                        {tCatalog('variants.offerLockedVariants')}
                      </div>
                    </div>
                  </div>
                )}
                <h2 className="text-md font-semibold text-gray-900 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-gray-500" />
                  {tCatalog('variants.title')}
                  <span className="relative group inline-flex items-center">
                    <Info
                      tabIndex={0}
                      aria-describedby="product-variants-info-tooltip"
                      aria-label={tCatalog('variants.infoAriaLabel')}
                      className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0a61d7]/40 rounded"
                    />
                    <span
                      id="product-variants-info-tooltip"
                      role="tooltip"
                      className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-[380px] -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 leading-5 text-gray-700 shadow-xl opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                    >
                      <span className="block text-xs font-semibold text-gray-900 mb-1.5">
                        {tCatalog('variants.tooltipTitle')}
                      </span>
                      <ol className="list-decimal list-inside space-y-1 text-xs text-gray-700">
                        <li>{tCatalog('variants.tooltipStep1')}</li>
                        <li>{tCatalog('variants.tooltipStep2')}</li>
                        <li>{tCatalog('variants.tooltipStep3')}</li>
                      </ol>
                      <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                        {tCatalog('variants.tooltipWarning')}
                      </p>
                      <p className="mt-2 text-[11px] text-gray-500">
                        {tCatalog('variants.tooltipFooter')}
                      </p>
                    </span>
                  </span>
                </h2>
              </div>

            {/* Simplified Variants Input */}
            <div className="space-y-4 mb-6">
              {variants.map((variant, index) => (
                <div key={variant.id} className="border border-[#e6e6e6] rounded-lg bg-white p-4">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-48">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          {tCatalog('variants.variantType')}
                        </label>
                        <input
                          type="text"
                          value={(variantDrafts.find((v) => v.id === variant.id)?.variantType ?? variant.variantType) as string}
                          onChange={(e) => updateVariant(variant.id, 'variantType', e.target.value)}
                          onFocus={(e) => {
                            guardVariantTypeEditOnFocus(variant.id).then((blocked) => {
                              if (blocked) (e.target as HTMLInputElement).blur();
                            });
                          }}
                          onBlur={() => commitVariantTypeRename(variant.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitVariantTypeRename(variant.id);
                            }
                          }}
                          disabled={isViewMode || isOfferConnected}
                          className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black font-semibold"
                          placeholder={tCatalog('variants.variantTypePlaceholder')}
                        />
                      </div>
                    </div>
                {!isViewMode && !isOfferConnected && (
                      <div className="flex items-center gap-2">
                        {index > 0 && (
                  <button
                    type="button"
                            onClick={() => {
                              setVariants(prev => {
                                const arr = [...prev];
                                const [moved] = arr.splice(index, 1);
                                arr.splice(index - 1, 0, moved);
                                return arr;
                              });
                            }}
                            className="text-gray-600 hover:text-black p-1"
                            title={tCatalog('variants.moveUp')}
                          >
                            <ChevronUp className="w-4 h-4" />
                  </button>
                )}
                        {index < variants.length - 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setVariants(prev => {
                                const arr = [...prev];
                                const [moved] = arr.splice(index, 1);
                                arr.splice(index + 1, 0, moved);
                                return arr;
                              });
                            }}
                            className="text-gray-600 hover:text-black p-1"
                            title={tCatalog('variants.moveDown')}
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                        )}
                        {variants.length > 1 && index > 0 && (
                        <button
                          type="button"
                            onClick={() => removeVariant(variant.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                            title={tCatalog('variants.removeVariant')}
                        >
                          <X className="w-4 h-4" />
                        </button>
                        )}
                      </div>
                      )}
                    </div>
                    
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-2">
                      {tCatalog('variants.options')}
                        </label>
                    <div className="flex flex-wrap gap-2">
                      {variant.options.map((option, optionIndex) => (
                        <div key={option.id} className="flex items-center gap-1">
                        <input
                          type="text"
                            value={
                              (variantDrafts
                                .find((v) => v.id === variant.id)
                                ?.options.find((o) => o.id === option.id)?.name ?? option.name) as string
                            }
                            onChange={(e) => updateVariantOption(variant.id, option.id, 'name', e.target.value)}
                            onFocus={(e) => {
                              guardVariantOptionEditOnFocus(variant.id, option.id).then((blocked) => {
                                if (blocked) (e.target as HTMLInputElement).blur();
                              });
                            }}
                            onBlur={() => commitVariantOptionRename(variant.id, option.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                commitVariantOptionRename(variant.id, option.id);
                              }
                            }}
                          disabled={isViewMode || isOfferConnected}
                            className="px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                            placeholder={tCatalog('variants.optionPlaceholder')}
                            style={{ minWidth: '120px' }}
                          />
                          {!isViewMode && !isOfferConnected && (variant.options.length > 1 || optionIndex > 0) && (
                            <button
                              type="button"
                              onClick={() => removeVariantOption(variant.id, option.id)}
                              className="text-red-500 hover:text-red-700 p-1"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                  </div>
                ))}
                {!isViewMode && !isOfferConnected && (
                  <button
                    type="button"
                          onClick={() => addVariantOption(variant.id)}
                          className="flex items-center gap-1 px-3 py-2 text-xs font-medium text-[#0a61d7] hover:text-[#0851b8] transition-colors border border-dashed border-[#0a61d7] rounded-lg"
                  >
                    <Plus className="w-4 h-4" />
                          {tCatalog('variants.addOption')}
                  </button>
                )}
              </div>
                      </div>
                    </div>
              ))}
              
              {!isViewMode && !isOfferConnected && (
                      <button
                        type="button"
                  onClick={addVariant}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 text-xs font-medium border-2 border-dashed border-gray-300 text-gray-700 rounded-lg hover:border-[#0a61d7] hover:text-[#0a61d7] transition-colors"
                      >
                  <Plus className="w-4 h-4" />
                  {tCatalog('variants.addVariantType')}
                      </button>
                    )}
                  </div>
                  
            {/* Final Combinations Table */}
            <div className="border-t border-[#e6e6e6] pt-6">
              {isOfferConnected && (
                <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-[#0a61d7]" />
                    <div className="text-xs text-[#0a61d7]">
                      {tCatalog('variants.offerLockedPrices')}
                    </div>
                  </div>
                </div>
              )}
              <div className="mb-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-md font-semibold text-gray-900 flex items-center gap-2">
                    <Package className="w-5 h-5 text-gray-500" />
                    {tCatalog('variants.variationLists')}
                    <span className="text-red-500">*</span>
                    <span className="relative group inline-flex items-center">
                      <Info
                        tabIndex={0}
                        aria-describedby="variation-lists-info-tooltip"
                        aria-label={tCatalog('variants.variationListsAriaLabel')}
                        className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0a61d7]/40 rounded"
                      />
                      <span
                        id="variation-lists-info-tooltip"
                        role="tooltip"
                        className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-[380px] -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 leading-5 text-gray-700 shadow-xl opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                      >
                        <span className="block text-xs font-semibold text-gray-900 mb-1.5">
                          {tCatalog('variants.variationListsTooltipTitle')}
                        </span>
                        <p className="text-xs text-gray-700">
                          {tCatalog('variants.variationListsTooltipBody1')}
                        </p>
                        <p className="mt-2 text-xs text-gray-700">
                          {tCatalog('variants.variationListsTooltipBody2')}
                        </p>
                        <p className="mt-2 text-[11px] text-gray-500">
                          {tCatalog('variants.variationListsTooltipFooter')}
                        </p>
                      </span>
                    </span>
                  </h2>
                  {!isViewMode && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={combinations.length === 0}
                        onClick={handleExportVariationList}
                        className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={tCatalog('variants.exportVariationsTitle')}
                      >
                        <Download className="w-4 h-4" />
                        {tCatalog('variants.exportVariations')}
                      </button>
                      <button
                        type="button"
                        disabled={isOfferConnected || combinations.length === 0}
                        onClick={() => setShowImportStockSetup(true)}
                        className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={tCatalog('variants.importVariationsTitle')}
                      >
                        <Upload className="w-4 h-4" />
                        {tCatalog('variants.importVariations')}
                      </button>
                      <button
                        type="button"
                        disabled={isOfferConnected}
                        onClick={() => setVariationRefreshTick((v) => v + 1)}
                        className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={tCatalog('variants.refreshTableTitle')}
                      >
                        <RefreshCw className="w-4 h-4" />
                        {tCatalog('variants.refresh')}
                      </button>
                    </div>
                  )}
                </div>
                {fieldErrors.variants ? <p className="text-red-500 text-xs mt-2">{fieldErrors.variants}</p> : null}
                {fieldErrors.stock ? <p className="text-red-500 text-xs mt-1">{fieldErrors.stock}</p> : null}
              </div>

            <StockLevelConversion
              stockLevels={formData.stockLevels}
              ratioDrafts={stockLevelRatioDrafts}
              totalPieces={stockSummary.updated}
              stockQuantities={combinations.map((combination) => combination.stockQuantity)}
              legacyStockUnit={legacyStockUnit}
              legacyPiecesPerUnit={legacyPiecesPerUnit}
              legacyConversionError={legacyConversionError}
              isViewMode={isViewMode}
              isOfferConnected={isOfferConnected}
              showSummary
              onAddStockLevel={addStockLevel}
              onUpdateStockLevel={updateStockLevel}
              onRatioDraftChange={(index, value) => {
                setStockLevelRatioDrafts((prev) => ({ ...prev, [index]: value }));
                updateStockLevelRatioValue(index, value);
              }}
              onRatioBlur={commitStockLevelRatioDraft}
              onRemoveStockLevel={removeStockLevel}
              onLegacyPiecesPerUnitChange={(value) => {
                setLegacyPiecesPerUnit(value);
                setLegacyConversionError('');
              }}
              onConvertLegacyStock={convertLegacyStockToPieces}
            />

            <PricingAnchorConfiguration
              stockLevels={activeStockLevels}
              sellingPriceUnit={formData.sellingPriceUnit || 'Pieces'}
              purchasePriceUnit={formData.purchasePriceUnit || 'Pieces'}
              title={tCatalog('variants.pricingConfigurationTitle')}
              description={tCatalog('variants.pricingConfigurationHint')}
              sellingLabel={tCatalog('variants.sellingPriceUnit')}
              purchaseLabel={tCatalog('variants.purchasePriceUnit')}
              disabled={isViewMode || isOfferConnected}
              onChange={updatePriceAnchor}
            />

                <div className="overflow-x-auto">
                  <table
                    ref={variationTableRef}
                    className={`${variationTablePixelWidth == null ? 'w-full ' : ''}border-collapse border border-gray-300`}
                    style={{
                      tableLayout: 'fixed',
                      width: variationTablePixelWidth != null ? variationTablePixelWidth : '100%',
                      ...(variationTablePixelWidth == null ? { minWidth: '100%' } : {}),
                    }}
                  >
                    <thead className="bg-gray-50">
                      <tr>
                        {variants.map((variant, index) => {
                          const colKey = `v:${variant.id}`;
                          const label =
                            variant.variantType || tCatalog('variants.varFallback', { index: index + 1 });
                          return (
                            <th
                              key={variant.id}
                              data-col-key={colKey}
                              className="relative text-xs font-semibold text-gray-700 px-2 py-1.5 text-left border-b border-r border-gray-300"
                              style={variationColStyle(colKey, VARIATION_COL_WEIGHTS.variant)}
                            >
                              {label}
                              <span
                                role="separator"
                                aria-orientation="vertical"
                                aria-label={label}
                                onPointerDown={(event) => beginVariationColResize(colKey, event)}
                                className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none hover:bg-[#0a61d7]/35"
                              />
                            </th>
                          );
                        })}
                        {([
                          ['sku', VARIATION_COL_WEIGHTS.sku, tCatalog('variants.sku')] as const,
                          ['sellingPrice', VARIATION_COL_WEIGHTS.sellingPrice, `${tCatalog('variants.sellingPrice')} / ${formData.sellingPriceUnit || 'Pieces'}`] as const,
                          ['purchasePrice', VARIATION_COL_WEIGHTS.purchasePrice, `${tCatalog('variants.purchasePrice')} / ${formData.purchasePriceUnit || 'Pieces'}`] as const,
                          ['moq', VARIATION_COL_WEIGHTS.moq, tCatalog('variants.moq')] as const,
                        ]).map(([colKey, weight, label]) => (
                          <th
                            key={colKey}
                            data-col-key={colKey}
                            className="relative text-xs font-semibold text-gray-700 px-2 py-1.5 text-left border-b border-r border-gray-300"
                            style={variationColStyle(colKey, weight)}
                          >
                            {label}
                            <span
                              role="separator"
                              aria-orientation="vertical"
                              aria-label={label}
                              onPointerDown={(event) => beginVariationColResize(colKey, event)}
                              className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none hover:bg-[#0a61d7]/35"
                            />
                          </th>
                        ))}
                        {displayStockLevels.map((level, levelIndex) => {
                          const colKey = `stock:${level.name.toLowerCase() || levelIndex}`;
                          return (
                            <th
                              key={colKey}
                              data-col-key={colKey}
                              className="relative text-xs font-semibold text-gray-700 px-2 py-1.5 text-left border-b border-r border-gray-300"
                              style={variationColStyle(colKey, VARIATION_COL_WEIGHTS.stock / Math.max(1, activeStockLevels.length))}
                            >
                              <div className="flex flex-col pr-1">
                                <span>{level.name}</span>
                                {!legacyStockUnit && level.name !== 'Pieces' && (
                                  <span className="text-[10px] font-normal text-gray-500">{tCatalog('variants.piecesPerUnitShort', { count: level.piecesPerUnit })}</span>
                                )}
                              </div>
                              <span
                                role="separator"
                                aria-orientation="vertical"
                                aria-label={level.name}
                                onPointerDown={(event) => beginVariationColResize(colKey, event)}
                                className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none hover:bg-[#0a61d7]/35"
                              />
                            </th>
                          );
                        })}
                        {([
                          ['lowThreshold', VARIATION_COL_WEIGHTS.lowThreshold, `${tCatalog('variants.lowThreshold')} (${tCatalog(`variants.stockUnits.${legacyStockUnit || 'Pieces'}`)})`] as const,
                          ['status', VARIATION_COL_WEIGHTS.status, tCatalog('variants.status')] as const,
                        ]).map(([colKey, weight, label]) => (
                          <th
                            key={colKey}
                            data-col-key={colKey}
                            className="relative text-xs font-semibold text-gray-700 px-2 py-1.5 text-left border-b border-r border-gray-300"
                            style={variationColStyle(colKey, weight)}
                          >
                            {label}
                            <span
                              role="separator"
                              aria-orientation="vertical"
                              aria-label={label}
                              onPointerDown={(event) => beginVariationColResize(colKey, event)}
                              className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none hover:bg-[#0a61d7]/35"
                            />
                          </th>
                        ))}
                        {!isViewMode && (
                          <th
                            data-col-key="actions"
                            className="relative text-xs font-semibold text-gray-700 px-2 py-1.5 text-center border-b border-gray-300"
                            style={variationColStyle('actions', VARIATION_COL_WEIGHTS.actions)}
                          >
                            {tCatalog('variants.actions')}
                            <span
                              role="separator"
                              aria-orientation="vertical"
                              aria-label={tCatalog('variants.actions')}
                              onPointerDown={(event) => beginVariationColResize('actions', event)}
                              className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none hover:bg-[#0a61d7]/35"
                            />
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                       {combinations.map((combination, index) => {
                         const rowHeight = variationRowHeight(combination.id);
                         return (
                         <tr key={combination.id} style={{ height: rowHeight }}>
                           {variants.map((variant, variantIndex) => (
                             <td
                               key={variant.id}
                               className="relative px-2 py-1.5 border-r border-b border-gray-300 align-middle"
                               style={{ height: rowHeight }}
                             >
                               <span className="text-xs text-black">
                                 {combination[`variant_${variant.id}` as keyof typeof combination]?.toString() || tCatalog('variants.none')}
                               </span>
                               {variantIndex === 0 ? (
                                 <span
                                   role="separator"
                                   aria-orientation="horizontal"
                                   aria-label={tCatalog('variants.variationLists')}
                                   onPointerDown={(event) => {
                                     event.preventDefault();
                                     event.stopPropagation();
                                     trackVariationSizeDrag({
                                       axis: 'y',
                                       startClient: event.clientY,
                                       startSize: rowHeight,
                                       min: VARIATION_ROW_MIN,
                                       applySize: (next: number) =>
                                        setVariationRowHeights((prev) => ({
                                          ...prev,
                                          [combination.id]: next,
                                        })),
                                     });
                                   }}
                                   className="absolute bottom-0 left-0 z-10 h-1.5 w-full cursor-row-resize touch-none hover:bg-[#0a61d7]/35"
                                 />
                               ) : null}
                             </td>
                           ))}
                          <td className="relative px-2 py-1.5 border-r border-b border-gray-300 align-middle" style={{ height: rowHeight }}>
                                <input
                              type="text"
                              value={String(combination.sku)}
                              onChange={(e) => updateCombination(combination.id, 'sku', e.target.value)}
                                  disabled={isViewMode || isOfferConnected}
                                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                              placeholder={tCatalog('variants.skuPlaceholder')}
                            />
                            {variants.length === 0 ? (
                              <span
                                role="separator"
                                aria-orientation="horizontal"
                                aria-label={tCatalog('variants.variationLists')}
                                onPointerDown={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  trackVariationSizeDrag({
                                    axis: 'y',
                                    startClient: event.clientY,
                                    startSize: rowHeight,
                                    min: VARIATION_ROW_MIN,
                                    applySize: (next: number) =>
                                      setVariationRowHeights((prev) => ({
                                        ...prev,
                                        [combination.id]: next,
                                      })),
                                  });
                                }}
                                className="absolute bottom-0 left-0 z-10 h-1.5 w-full cursor-row-resize touch-none hover:bg-[#0a61d7]/35"
                              />
                            ) : null}
                          </td>
                          <td className="px-2 py-1.5 border-r border-b border-gray-300 align-middle" style={{ height: rowHeight }}>
                            <div className="flex flex-col">
                            <div className="relative">
                              <div className="absolute left-2 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                                {currencySymbol}
                              </div>
                              <input
                                type="text"
                                value={String(combination.sellingPrice)}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  // Only update if the value is numeric (allows numbers, decimals, and empty string)
                                  if (validateNumericInput(value)) {
                                    updateCombination(combination.id, 'sellingPrice', value);
                                  }
                                }}
                                disabled={isViewMode || isOfferConnected}
                                className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                                placeholder={getPricePlaceholder(userCurrency)}
                              />
                              </div>
                              {(formData.sellingPriceUnit || 'Pieces') !== 'Pieces' && (() => {
                                const anchor = activeStockLevels.find((level) => level.name === formData.sellingPriceUnit);
                                const anchorPieces = anchor?.piecesPerUnit || 1;
                                const raw = parseNumberByCurrency(String(combination.sellingPrice || ''), userCurrency);
                                if (!String(combination.sellingPrice || '').trim() || !Number.isFinite(raw)) return null;
                                return <div className="mt-1 truncate text-[10px] text-gray-500" title={`Per Piece: ${currencySymbol} ${(raw / anchorPieces).toFixed(2)}`}>{tCatalog('variants.pricePerPiece')}: {currencySymbol} {formatCurrencyAmount(raw / anchorPieces, userCurrency)}</div>;
                              })()}
                              {isOfferConnected && (() => {
                                const dbPrice = (combination as Record<string, unknown>).dbSellingPrice;
                                if (!dbPrice) return null;
                                
                                // Only show discounted price if there's an actual discount type (not just promotion)
                                const productDiscountType = (product as { discountType?: string }).discountType;
                                const hasActualDiscount = productDiscountType === 'percentage' || productDiscountType === 'fixed';
                                
                                if (!hasActualDiscount) return null;
                                
                                return (
                                  <div className="mt-1 text-xs text-gray-600">
                                    Discounted: {currencySymbol} {formatCurrencyAmount(parseNumberByCurrency(String(dbPrice), userCurrency), userCurrency)}
                                  </div>
                                );
                              })()}
                            </div>
                          </td>
                          <td className="px-2 py-1.5 border-r border-b border-gray-300 align-middle" style={{ height: rowHeight }}>
                            <div className="relative">
                              <div className="absolute left-2 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 pointer-events-none">
                                {currencySymbol}
                              </div>
                              <input
                                type="text"
                                value={String(combination.purchasePrice)}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  // Only update if the value is numeric (allows numbers, decimals, and empty string)
                                  if (validateNumericInput(value)) {
                                    updateCombination(combination.id, 'purchasePrice', value);
                                  }
                                }}
                                disabled={isViewMode || isOfferConnected}
                                className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                                placeholder={getPricePlaceholder(userCurrency)}
                              />
                            </div>
                            {(formData.purchasePriceUnit || 'Pieces') !== 'Pieces' && (() => {
                              const anchor = activeStockLevels.find((level) => level.name === formData.purchasePriceUnit);
                              const anchorPieces = anchor?.piecesPerUnit || 1;
                              const raw = parseNumberByCurrency(String(combination.purchasePrice || ''), userCurrency);
                              if (!String(combination.purchasePrice || '').trim() || !Number.isFinite(raw)) return null;
                              return <div className="mt-1 truncate text-[10px] text-gray-500" title={`Per Piece: ${currencySymbol} ${(raw / anchorPieces).toFixed(2)}`}>{tCatalog('variants.pricePerPiece')}: {currencySymbol} {formatCurrencyAmount(raw / anchorPieces, userCurrency)}</div>;
                            })()}
                          </td>
                          <td className="px-2 py-1.5 border-r border-b border-gray-300 align-middle" style={{ height: rowHeight }}>
                            <input
                              type="number"
                              value={combination.moq || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                updateCombination(combination.id, 'moq', value ? parseInt(value) : undefined);
                              }}
                              disabled={isViewMode || isOfferConnected}
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                              placeholder={tCatalog('variants.numberPlaceholder')}
                              min="0"
                              step="1"
                            />
                          </td>
                          {displayStockLevels.map((level, levelIndex) => {
                            const ratio = legacyStockUnit ? 1 : (level.piecesPerUnit || 1);
                            const wholeQuantity = getWholeStockQuantity(combination.stockQuantity, ratio);
                            const fractionLabel = legacyStockUnit ? '' : getStockLevelFractionLabel(combination.stockQuantity, ratio);
                            return (
                              <td key={`${combination.id}-${level.name}-${levelIndex}`} className="px-2 py-1.5 border-r border-b border-gray-300 align-middle" style={{ height: rowHeight }}>
                                <div className="flex min-w-0 items-center gap-1">
                                  <input
                                    type="number"
                                    value={isViewMode ? wholeQuantity : (wholeQuantity || '')}
                                    onChange={(event) => {
                                      const nextWhole = event.target.value === '' ? 0 : Number.parseInt(event.target.value, 10);
                                      if (!Number.isSafeInteger(nextWhole) || nextWhole < 0) return;
                                      updateCombination(
                                        combination.id,
                                        'stockQuantity',
                                        updateStockFromWholeQuantity(combination.stockQuantity, nextWhole, ratio),
                                      );
                                    }}
                                    disabled={isViewMode || isOfferConnected}
                                    className="min-w-0 w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                                    placeholder={tCatalog('variants.numberPlaceholder')}
                                    min="0"
                                    step="1"
                                  />
                                  {fractionLabel && <span className="shrink-0 text-xs text-gray-500 tabular-nums">{fractionLabel}</span>}
                                </div>
                              </td>
                            );
                          })}
                          <td className="px-2 py-1.5 border-r border-b border-gray-300 align-middle" style={{ height: rowHeight }}>
                            <input
                              type="number"
                              value={
                                isViewMode
                                  ? combination.lowStockThreshold
                                  : (combination.lowStockThreshold || '')
                              }
                              onChange={(e) => {
                                const value = e.target.value;
                                updateCombination(
                                  combination.id,
                                  'lowStockThreshold',
                                  value === '' ? 0 : parseInt(value, 10) || 0,
                                );
                              }}
                              disabled={isViewMode || isOfferConnected}
                              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent disabled:bg-gray-50 text-black"
                              placeholder={tCatalog('variants.numberPlaceholder')}
                              min="0"
                              step="1"
                            />
                          </td>
                          <td className="px-2 py-1.5 border-r border-b border-gray-300 align-middle" style={{ height: rowHeight }}>
                            {(() => {
                              const rowStatus = getVariantStockStatus(
                                combination.stockQuantity,
                                combination.lowStockThreshold,
                              );
                              return (
                            <span className={`text-xs font-medium ${
                              rowStatus === 'Out of Stock' 
                                ? 'text-red-600'
                                : rowStatus === 'Low Stock'
                                ? 'text-yellow-600'
                                : 'text-green-600'
                            }`}>
                              {translateStockStatus(rowStatus)}
                            </span>
                              );
                            })()}
                          </td>
                          {!isViewMode && (
                            <td className="px-2 py-1.5 text-center border-b border-gray-300 align-middle" style={{ height: rowHeight }}>
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (index > 0) {
                                      const newCombinations = [...combinations];
                                      [newCombinations[index - 1], newCombinations[index]] = [newCombinations[index], newCombinations[index - 1]];
                                      setCombinations(newCombinations);
                                    }
                                  }}
                                  disabled={index === 0}
                                  className="text-blue-500 hover:text-blue-700 p-1 disabled:text-gray-300"
                                  title={tCatalog('variants.moveUp')}
                                >
                                  <ChevronUp className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (index < combinations.length - 1) {
                                      const newCombinations = [...combinations];
                                      [newCombinations[index], newCombinations[index + 1]] = [newCombinations[index + 1], newCombinations[index]];
                                      setCombinations(newCombinations);
                                    }
                                  }}
                                  disabled={index === combinations.length - 1}
                                  className="text-blue-500 hover:text-blue-700 p-1 disabled:text-gray-300"
                                  title={tCatalog('variants.moveDown')}
                                >
                                  <ChevronDown className="w-4 h-4" />
                                </button>
                            </div>
                            </td>
                          )}
                        </tr>
                       );
                       })}
                    </tbody>
                  </table>
                          </div>
            </div>
            </div>
          </div>
        </div>
      </form>

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-green-600 text-white rounded-lg shadow-2xl p-4 flex items-center gap-4 animate-fade-in pointer-events-auto">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-md font-semibold">{tCatalog('successModal.title')}</h3>
              <p className="text-xs text-white/90">{tCatalog('successModal.description')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Variant guard modal (no browser confirm) */}
      {variantGuardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
            <div className="p-4">
              <h3 className="text-md font-semibold text-gray-900">{variantGuardModal.title}</h3>
              {variantGuardModal.intro && (
                <p className="mt-2 text-xs text-gray-700">{variantGuardModal.intro}</p>
              )}

              {Array.isArray(variantGuardModal.items) && variantGuardModal.items.length > 0 && (
                <ul className="mt-3 space-y-2 text-xs text-gray-700">
                  {variantGuardModal.items.map((it) => (
                    <li key={it.variantName} className="leading-5">
                      <div className="font-medium">
                        - {it.variantName} ({it.orderItemCount})
                      </div>
                      {Array.isArray(it.orderIds) && it.orderIds.length > 0 && (
                        <div className="mt-1 text-xs text-gray-600">
                          {tCatalog('variantGuard.orders')}{' '}
                          {it.orderIds!.map((oid, idx) => (
                            <React.Fragment key={oid}>
                              <a
                                href={`/orders/details/${encodeURIComponent(oid)}`}
                                className="text-[#0a61d7] hover:underline"
                              >
                                {oid}
                              </a>
                              {idx < it.orderIds!.length - 1 ? ', ' : ''}
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {variantGuardModal.message && (
                <p className="mt-3 text-xs text-gray-700 whitespace-pre-line">{variantGuardModal.message}</p>
              )}
              {variantGuardModal.footer && (
                <p className="mt-3 text-xs text-gray-700 whitespace-pre-line">{variantGuardModal.footer}</p>
              )}
              {variantGuardModal.policy && (
                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-semibold text-gray-900">{tCatalog('variantGuard.whatToDoInstead')}</p>
                  <p className="mt-1 text-xs text-gray-700 whitespace-pre-line">{variantGuardModal.policy}</p>
                </div>
              )}
              <div className="mt-4 flex justify-end gap-2">
                {variantGuardModal.action?.kind === 'create_option' && (
                  <button
                    type="button"
                    onClick={() => {
                      addVariantOption(variantGuardModal.action!.variantId, variantGuardModal.action!.initialName);
                      setVariantGuardModal(null);
                    }}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#0a61d7]/30"
                  >
                    {tCatalog('variantGuard.createNewOption')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setVariantGuardModal(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0a61d7] text-white hover:bg-[#0851b8] focus:outline-none focus:ring-2 focus:ring-[#0a61d7]/40"
                >
                  {tCatalog('variantGuard.ok')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ImportVariantModal
        open={showImportStockSetup}
        stockLevels={formData.stockLevels}
        sellingPriceUnit={formData.sellingPriceUnit || 'Pieces'}
        purchasePriceUnit={formData.purchasePriceUnit || 'Pieces'}
        onPriceAnchorChange={updatePriceAnchor}
        ratioDrafts={stockLevelRatioDrafts}
        totalPieces={combinations.reduce((sum, combo) => sum + combo.stockQuantity, 0)}
        legacyStockUnit={legacyStockUnit}
        legacyPiecesPerUnit={legacyPiecesPerUnit}
        legacyConversionError={legacyConversionError}
        isOfferConnected={isOfferConnected}
        onAddStockLevel={addStockLevel}
        onUpdateStockLevel={updateStockLevel}
        onRatioDraftChange={(index, value) => {
          setStockLevelRatioDrafts((prev) => ({ ...prev, [index]: value }));
          updateStockLevelRatioValue(index, value);
        }}
        onRatioBlur={commitStockLevelRatioDraft}
        onRemoveStockLevel={removeStockLevel}
        onLegacyPiecesPerUnitChange={(value) => {
          setLegacyPiecesPerUnit(value);
          setLegacyConversionError('');
        }}
        onConvertLegacyStock={convertLegacyStockToPieces}
        onCancel={() => setShowImportStockSetup(false)}
        onContinue={() => {
          const ratioError = validateStockLevels(formData.stockLevels);
          if (ratioError) {
            alert(ratioError);
            return;
          }
          setShowImportStockSetup(false);
          setShowVariationImport(true);
        }}
      />

      <VariationListImport
        open={showVariationImport}
        onCloseAction={() => setShowVariationImport(false)}
        variantColumns={variationImportColumns}
        onImportAction={handleVariationImport}
      />
    </div>
  );
}

