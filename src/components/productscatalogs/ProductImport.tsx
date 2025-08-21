'use client';
import React, { useEffect, useState } from "react";
import { Upload, Download, X, CheckCircle, AlertCircle } from "lucide-react";

interface ProductImportProps {
  onImport?: (data: any[]) => void;
  onExport?: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function ProductImport({ onImport, onExport, isOpen, onClose }: ProductImportProps) {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setIsImportModalOpen(isOpen);
  }, [isOpen]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
          file.type === 'application/vnd.ms-excel' ||
          file.name.endsWith('.xlsx') || 
          file.name.endsWith('.xls') ||
          file.name.endsWith('.csv')) {
        setSelectedFile(file);
        setErrorMessage('');
      } else {
        setErrorMessage('Please select a valid Excel (.xlsx, .xls) or CSV file.');
        setSelectedFile(null);
      }
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    setImportStatus('processing');
    setImportProgress(0);

    try {
      // Simulate import process
      for (let i = 0; i <= 100; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        setImportProgress(i);
      }

      // Mock successful import
      setImportStatus('success');
      
      // Call the onImport callback if provided
      if (onImport) {
        // Mock data - in real implementation, this would parse the file
        const mockImportedData = [
          { name: 'Product 1', category: 'Foods', brand: 'Brand A', price: '1000' },
          { name: 'Product 2', category: 'Beverages', brand: 'Brand B', price: '2000' },
        ];
        onImport(mockImportedData);
      }

      // Close modal after success
      setTimeout(() => {
        setIsImportModalOpen(false);
        setImportStatus('idle');
        setSelectedFile(null);
        setImportProgress(0);
      }, 2000);

    } catch (error) {
      setImportStatus('error');
      setErrorMessage('Import failed. Please try again.');
    }
  };

  const handleExport = () => {
    if (onExport) {
      onExport();
    } else {
      // Default export behavior
      console.log('Exporting products...');
    }
  };

  const closeModal = () => {
    setIsImportModalOpen(false);
    setImportStatus('idle');
    setSelectedFile(null);
    setImportProgress(0);
    setErrorMessage('');
  };

  return (
    <>
      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Import Products</h3>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* File Upload Area */}
            <div className="mb-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[#0a61d7] transition-colors">
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">
                    {selectedFile ? selectedFile.name : 'Click to select file or drag and drop'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Supports .xlsx, .xls, and .csv files
                  </p>
                </label>
              </div>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-red-600">{errorMessage}</span>
                </div>
              </div>
            )}

            {/* Import Progress */}
            {importStatus === 'processing' && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                  <span>Importing products...</span>
                  <span>{importProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-[#0a61d7] h-2 rounded-full transition-all duration-300"
                    style={{ width: `${importProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Success Message */}
            {importStatus === 'success' && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-green-600">Products imported successfully!</span>
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!selectedFile || importStatus === 'processing'}
                className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {importStatus === 'processing' ? 'Importing...' : 'Import'}
              </button>
            </div>

            {/* Import Instructions */}
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Import Format:</h4>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• Product Name (required)</li>
                <li>• Category (required)</li>
                <li>• Brand (optional)</li>
                <li>• SKU (optional)</li>
                <li>• Purchase Price (optional)</li>
                <li>• Selling Price (optional)</li>
                <li>• Stock Quantity (optional)</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
