'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Trash, User, X, Loader2, AlertCircle, CheckCircle, ChevronDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/store/userStore';
import { Supplier, SupplyDetail, SupplierFormData } from '@/types/client';
import { getDefaultCurrency, getCurrencySymbol } from '@/utils/currencyUtils';
import { fetchGraphQL } from '@/lib/graphqlClient';

const categories = ["Instant Noodles", "Mineral Water", "Rice", "Bread"];
const statusOptions = ["Active", "Inactive", "Blocked"];

function generateSupplierId() {
  return 'LKS-' + Math.floor(10000000 + Math.random() * 90000000).toString();
}

interface SupplierModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: SupplierFormData) => void;
  initialData?: Supplier;
  mode?: 'edit';
}

export default function SupplierModal({ open, onClose, onSave, initialData, mode }: SupplierModalProps) {
  const router = useRouter();
  const user = useUserStore(state => state.user);
  const [isClient, setIsClient] = useState(false);
  
  // Prevent hydration mismatch by only using user currency on client
  useEffect(() => {
    setIsClient(true);
  }, []);
  
  // Get currency for display (only on client)
  const userCurrency = isClient ? (user?.currency || getDefaultCurrency()) : getDefaultCurrency();
  const currencySymbol = getCurrencySymbol(userCurrency);
  
  // Helper function to safely parse JSON strings (moved to top to fix initialization error)
  const safeParseJSON = useCallback((jsonStr: string, fallback: unknown) => {
    if (!jsonStr) return fallback;
    try {
      return JSON.parse(jsonStr);
    } catch {
      return fallback;
    }
  }, []);
  
  const [form, setForm] = useState(() => {
    if (!initialData) {
      return {
        supplierName: '', contact: '', phone: '', email: '', businessType: '', address: '', 
        status: statusOptions[0], createdAt: new Date().toISOString().split('T')[0], preferredDays: '', lastDelivery: '', 
        deliverySuccess: '', notes: '',
      };
    }
    
    // Parse JSON strings from database
    const parsedNotes = safeParseJSON(initialData.notes || '', []);
    const parsedLogistics = safeParseJSON(initialData.logistics || '', {});
    
    return {
      supplierName: initialData.name && !initialData.name.includes('Missing') ? initialData.name : '',
      contact: initialData.contact && !initialData.contact.includes('Missing') ? initialData.contact : '',
      phone: initialData.phone && !initialData.phone.includes('Missing') ? initialData.phone : '',
      email: initialData.email && !initialData.email.includes('Missing') ? initialData.email : '',
      businessType: initialData.businessType && !initialData.businessType.includes('Missing') ? initialData.businessType : '',
      address: initialData.address && !initialData.address.includes('Missing') ? initialData.address : '',
      status: initialData.status || statusOptions[0],
      createdAt: initialData.createdAt ? new Date(initialData.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      preferredDays: parsedLogistics.preferredDays && !parsedLogistics.preferredDays.includes('Missing') ? parsedLogistics.preferredDays : '',
      lastDelivery: parsedLogistics.lastDelivery && !parsedLogistics.lastDelivery.includes('Missing') ? parsedLogistics.lastDelivery : '',
      deliverySuccess: parsedLogistics.deliverySuccess && !parsedLogistics.deliverySuccess.includes('Missing') ? parsedLogistics.deliverySuccess : '',
      notes: Array.isArray(parsedNotes) ? parsedNotes.join(', ') : '',
    };
  });
  
  const [id, setId] = useState(() => initialData?.supplierId || generateSupplierId());
  const [supplyRows, setSupplyRows] = useState<SupplyDetail[]>(
    initialData?.supplies ? (() => {
      try {
        const parsed = JSON.parse(initialData.supplies);
        return Array.isArray(parsed) ? parsed.map((row: SupplyDetail) => ({
          suppliesno: row.suppliesno || '',
          sku: row.sku || '',
          product: row.product || '',
          totalSupplied: row.totalSupplied || '',
          totalValue: row.totalValue || '',
          lastDelivery: row.lastDelivery || '',
          status: row.status || statusOptions[0]
        })) : [{ suppliesno: '', sku: '', product: '', totalSupplied: '', totalValue: '', lastDelivery: '', status: statusOptions[0] }];
      } catch {
        return [{ suppliesno: '', sku: '', product: '', totalSupplied: '', totalValue: '', lastDelivery: '', status: statusOptions[0] }];
      }
    })() : [{ suppliesno: '', sku: '', product: '', totalSupplied: '', totalValue: '', lastDelivery: '', status: statusOptions[0] }]
  );

  // Enhanced state management with proper typing
  const [saving, setSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  // Function to get the latest delivery date
  const getLatestDeliveryDate = useCallback((rows: SupplyDetail[]) => {
    if (!rows || rows.length === 0) return '';
    const dates = rows
      .map(row => row.lastDelivery)
      .filter(date => date && date.trim() !== '')
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return dates.length > 0 ? dates[0] : '';
  }, []);

  // Update lastDelivery when supplyRows change
  useEffect(() => {
    const latestDate = getLatestDeliveryDate(supplyRows);
    if (latestDate && latestDate !== form.lastDelivery) {
      setForm(prev => ({ ...prev, lastDelivery: latestDate }));
    }
  }, [supplyRows, form.lastDelivery, getLatestDeliveryDate]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setShowStatusDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Enhanced form validation
  // Client-side validation - no required fields
  const validateForm = useCallback(() => {
    const errors: Record<string, string> = {};
    
    // No validation - all fields are optional
    setValidationErrors(errors);
    return true;
  }, []);

  // Enhanced error handling
  const handleError = useCallback((message: string) => {
    setError(message);
    setSuccess('');
    // Auto-hide error after 5 seconds
    setTimeout(() => setError(''), 5000);
  }, []);

  // Enhanced success handling
  const handleSuccess = useCallback((message: string) => {
    setSuccess(message);
    setError('');
    // Auto-hide success after 3 seconds
    setTimeout(() => setSuccess(''), 3000);
  }, []);

  // Enhanced supply row management
  const handleSupplyChange = useCallback((idx: number, field: keyof SupplyDetail, value: string) => {
    setSupplyRows((rows: SupplyDetail[]) => rows.map((row: SupplyDetail, i: number) => i === idx ? { ...row, [field]: value } : row));
  }, []);

  const addSupplyRow = useCallback(() => {
    setSupplyRows((rows: SupplyDetail[]) => [...rows, { suppliesno: '', sku: '', product: '', totalSupplied: '', totalValue: '', lastDelivery: '', status: statusOptions[0] }]);
  }, []);

  const deleteSupplyRow = useCallback((idx: number) => {
    if (supplyRows.length > 1) {
      setSupplyRows((rows: SupplyDetail[]) => rows.filter((_: SupplyDetail, i: number) => i !== idx));
    }
  }, [supplyRows.length]);

  // Handle edit mode initialization
  useEffect(() => {
    if (open && mode === 'edit' && initialData) {
      // Parse JSON strings from database
      const parsedNotes = safeParseJSON(initialData.notes || '', []);
      const parsedLogistics = safeParseJSON(initialData.logistics || '', {});
      
      // Get supplies first to calculate latest date
      const supplies = initialData?.supplies ? (() => {
        try {
          const parsed = JSON.parse(initialData.supplies);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })() : [];
      
      const latestDeliveryDate = getLatestDeliveryDate(supplies);
      
      setForm({
        supplierName: initialData.name || '',
        contact: initialData.contact || '',
        phone: initialData.phone || '',
        email: initialData.email || '',
        businessType: initialData.businessType || '',
        address: initialData.address || '',
        status: initialData.status || statusOptions[0],
        createdAt: initialData.createdAt ? new Date(initialData.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        preferredDays: parsedLogistics.preferredDays || '',
        lastDelivery: latestDeliveryDate || parsedLogistics.lastDelivery || '',
        deliverySuccess: parsedLogistics.deliverySuccess || '',
        notes: Array.isArray(parsedNotes) ? parsedNotes.join(', ') : '',
      });
      
      setId(initialData.supplierId || generateSupplierId());
      setSupplyRows(
        supplies.length > 0 ? supplies.map((row: SupplyDetail) => ({
          suppliesno: row.suppliesno || '',
          sku: row.sku || '',
          product: row.product || '',
          totalSupplied: row.totalSupplied || '',
          totalValue: row.totalValue || '',
          lastDelivery: row.lastDelivery || '',
          status: row.status || statusOptions[0]
        })) : [{ suppliesno: '', sku: '', product: '', totalSupplied: '', totalValue: '', lastDelivery: '', status: statusOptions[0] }]
      );
    }
  }, [open, mode, initialData, safeParseJSON, getLatestDeliveryDate]);

  // Enhanced form submission
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    setSaving(true);
    setError('');
    setSuccess('');
    
    try {
      const isEdit = mode === 'edit';
      const payload: Record<string, unknown> = {
        ...form,
        supplierId: id,
        name: form.supplierName,

        supplies: JSON.stringify(supplyRows),
        notes: JSON.stringify(form.notes.split(',').map((n: string) => n.trim())),
        createdAt: isEdit ? (form.createdAt ? new Date(form.createdAt).toISOString() : new Date().toISOString()) : new Date().toISOString(),
        logistics: JSON.stringify({
          preferredDays: form.preferredDays || '',
          lastDelivery: form.lastDelivery || '',
          deliverySuccess: form.deliverySuccess || ''
        }),
        userId: user?.id,
      };
      if (isEdit && initialData && typeof initialData.id === 'number') {
        payload.id = initialData.id;
      }
      delete payload.supplierName;
      delete payload.preferredDays;
      delete payload.lastDelivery;
      delete payload.deliverySuccess;
      
      // Debug: Log the payload being sent
      // Supplier payload prepared for submission
      
      let savedSupplier: Supplier | null = null;
      
      if (isEdit) {
        const UPDATE_SUPPLIER_MUTATION = `
          mutation UpdateSupplier(
            $userId: Int!
            $id: String
            $supplierId: String
            $name: String
            $contact: String
            $email: String
            $phone: String
            $businessType: String
            $address: String
            $status: String
            $logistics: String
            $notes: String
            $supplies: String
          ) {
            updateSupplier(
              userId: $userId
              id: $id
              supplierId: $supplierId
              name: $name
              contact: $contact
              email: $email
              phone: $phone
              businessType: $businessType
              address: $address
              status: $status
              logistics: $logistics
              notes: $notes
              supplies: $supplies
            ) {
              id
              supplierId
              name
              contact
              email
              phone
              businessType
              address
              status
              logistics
              notes
              supplies
              avgMonthlyPurchaseValue
              totalPurchases
              totalSupplies
              onTimeDeliveryRate
              userId
              createdAt
              updatedAt
            }
          }
        `;
        
        const data = await fetchGraphQL<{ updateSupplier: Supplier }>(UPDATE_SUPPLIER_MUTATION, {
          userId: user?.id,
          id: initialData?.supplierId || initialData?.id?.toString(),
          supplierId: payload.supplierId,
          name: payload.name,
          contact: payload.contact,
          email: payload.email,
          phone: payload.phone,
          businessType: payload.businessType,
          address: payload.address,
          status: payload.status,
          logistics: payload.logistics,
          notes: payload.notes,
          supplies: payload.supplies,
      });
        
        savedSupplier = data.updateSupplier;
        onSave(savedSupplier as unknown as SupplierFormData);
      } else {
        const CREATE_SUPPLIER_MUTATION = `
          mutation CreateSupplier(
            $userId: Int!
            $supplierId: String
            $name: String
            $contact: String
            $email: String
            $phone: String
            $businessType: String
            $address: String
            $status: String
            $logistics: String
            $notes: String
            $supplies: String
          ) {
            createSupplier(
              userId: $userId
              supplierId: $supplierId
              name: $name
              contact: $contact
              email: $email
              phone: $phone
              businessType: $businessType
              address: $address
              status: $status
              logistics: $logistics
              notes: $notes
              supplies: $supplies
            ) {
              id
              supplierId
              name
              contact
              email
              phone
              businessType
              address
              status
              logistics
              notes
              supplies
              avgMonthlyPurchaseValue
              totalPurchases
              totalSupplies
              onTimeDeliveryRate
              userId
              createdAt
              updatedAt
            }
          }
        `;
        
        const data = await fetchGraphQL<{ createSupplier: Supplier }>(CREATE_SUPPLIER_MUTATION, {
          userId: user?.id,
          supplierId: payload.supplierId,
          name: payload.name,
          contact: payload.contact,
          email: payload.email,
          phone: payload.phone,
          businessType: payload.businessType,
          address: payload.address,
          status: payload.status,
          logistics: payload.logistics,
          notes: payload.notes,
          supplies: payload.supplies,
        });
      
        savedSupplier = data.createSupplier;
        onSave(savedSupplier as unknown as SupplierFormData);
      }
      
      if (isEdit && savedSupplier) {
        // Close modal first
        onClose();
        // Show success modal after modal closes
        setTimeout(() => {
          setShowSuccessModal(true);
          // If we're on the details page, the onSave callback will handle the refresh
          // Otherwise, redirect to profile page
          const currentPath = window.location.pathname;
          if (currentPath.includes('/clients/suppliers/details/')) {
            // Already on details page, onSave will trigger refresh via onUpdate
            setTimeout(() => {
              setShowSuccessModal(false);
            }, 2000);
          } else {
            // Not on details page, redirect
            const routeId = savedSupplier.supplierId || payload.supplierId as string;
            setTimeout(() => {
              setShowSuccessModal(false);
        router.push(`/clients/suppliers/details/${routeId}`);
        setTimeout(() => window.location.reload(), 100);
            }, 2000);
          }
        }, 100);
      } else {
        // Close modal first
        onClose();
        // Show success modal after modal closes
        setTimeout(() => {
          setShowSuccessModal(true);
          setTimeout(() => {
            setShowSuccessModal(false);
          }, 2000);
        }, 100);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save supplier';
      handleError(errorMessage);
    } finally {
      setSaving(false);
      setIsSubmitting(false);
    }
  }, [form, id, supplyRows, mode, initialData, user?.id, onSave, onClose, router, validateForm, handleError, handleSuccess, isSubmitting]);

  return (
    <>
      {open && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl p-4 w-full max-w-5xl relative max-h-[90vh] overflow-hidden">
        <button
          type="button"
          className="absolute top-5 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          onClick={onClose}
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>
        
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-[#0a61d7] rounded-lg flex items-center justify-center">
            <User className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-black">
              {mode === 'edit' ? 'Edit Supplier' : 'Add Supplier'}
            </h2>
            <p className="text-gray-500 text-sm">
              {mode === 'edit' ? 'Update supplier information and settings' : 'Create a new supplier profile'}
            </p>
          </div>
        </div>
        <div className="border-b border-gray-200 -mx-6"></div>
        <form className="flex flex-col gap-2 overflow-y-auto max-h-[60vh] hide-scrollbar">
          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-700 mb-1">ID</label>
            <input type="text" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2 disabled:bg-gray-100" value={id || ''} onChange={e => setId(e.target.value)} required disabled />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Supplier Name</label>
            <input type="text" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.supplierName || ''} onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Contact Person</label>
            <input type="text" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.contact || ''} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} required />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
              <input type="text" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <input type="email" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Business Type</label>
              <input type="text" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.businessType || ''} onChange={e => setForm(f => ({ ...f, businessType: e.target.value }))} placeholder="e.g. Manufacturer, Importer, Distributor, Trader...." />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <div className="relative" ref={statusDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg text-black text-left flex items-center justify-between"
                >
                  <span className={form.status ? 'text-black' : 'text-gray-500'}>
                    {form.status || 'Select status'}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
                {showStatusDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {statusOptions.map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => {
                          setForm(f => ({ ...f, status }));
                          setShowStatusDropdown(false);
                        }}
                        className={`w-full px-3 py-2 text-xs text-left hover:bg-gray-100 ${
                          form.status === status ? 'text-[#0a61d7] font-semibold bg-gray-50' : 'text-gray-700'
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Address</label>
            <textarea className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} required />
          </div>
          {/* Supplies & Product Data Table */}
          <div className="my-2 border-t border-gray-200 pt-2">
            <label className="block text-sm font-bold text-black mb-2">Supplies & Product Data</label>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-xs font-medium text-left bg-white">
                <thead>
                  <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                    <th className="py-2 px-3 font-medium uppercase">No.</th>
                    <th className="py-2 px-3 font-medium uppercase">SKU</th>
                    <th className="py-2 px-3 font-medium uppercase">Product</th>
                    <th className="py-2 px-3 font-medium uppercase">Total Supplied (Boxes)</th>
                    <th className="py-2 px-3 font-medium uppercase">Total Value</th>
                    <th className="py-2 px-3 font-medium uppercase">Last Delivery</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {supplyRows.map((row: SupplyDetail, idx: number) => (
                    <tr key={idx} className="whitespace-nowrap">
                      <td className="py-2 px-3 font-medium text-black">{idx + 1}</td>
                      <td className="py-2 px-3"><input type="text" className="w-full text-black border border-gray-200 rounded px-1 py-1" value={row.sku || ''} onChange={e => handleSupplyChange(idx, 'sku', e.target.value)} /></td>
                      <td className="py-2 px-3"><input type="text" className="w-full text-black border border-gray-200 rounded px-1 py-1" value={row.product || ''} onChange={e => handleSupplyChange(idx, 'product', e.target.value)} /></td>
                      <td className="py-2 px-3"><input type="number" className="w-full text-black border border-gray-200 rounded px-1 py-1" value={row.totalSupplied || ''} onChange={e => handleSupplyChange(idx, 'totalSupplied', e.target.value)} /></td>
                      <td className="py-2 px-3">
                        <div className="flex items-center">
                          <span className="mr-2 text-xs text-gray-500 font-medium">{currencySymbol}</span>
                          <input type="text" className="flex-1 text-black border border-gray-200 rounded px-1 py-1 focus:ring-blue-500 focus:border-blue-500 transition-colors" value={row.totalValue || ''} onChange={e => handleSupplyChange(idx, 'totalValue', e.target.value)} placeholder="0" />                   
                        </div>
                      </td>
                      <td className="py-2 px-3"><input type="date" className="w-full text-black border border-gray-200 rounded px-1 py-1" value={row.lastDelivery || ''} onChange={e => handleSupplyChange(idx, 'lastDelivery', e.target.value)} /></td>
                      <td className="py-2 px-3">
                        <button type="button" className="text-red-500 font-bold p-1 hover:bg-red-100 rounded-full" onClick={() => deleteSupplyRow(idx)} disabled={supplyRows.length === 1}><Trash className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="mt-2 px-3 py-1 rounded-lg bg-[#0a61d7] text-white text-xs font-semibold hover:bg-[#084ba6]" onClick={addSupplyRow}>+ Add Row</button>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                Created At 
                <span className="text-xs text-gray-400">(auto-generated)</span>
                <div className="w-3 h-3 bg-gray-200 rounded-full flex items-center justify-center text-[8px] text-gray-500">i</div>
              </label>
              <input type="date" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2 disabled:bg-gray-100 cursor-not-allowed" value={form.createdAt || ''} onChange={e => setForm(f => ({ ...f, createdAt: e.target.value }))} required disabled />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Preferred Delivery Days</label>
              <input type="text" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.preferredDays || ''} onChange={e => setForm(f => ({ ...f, preferredDays: e.target.value }))} placeholder="e.g. Tue, Thu" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                Last Delivery Date 
                <span className="text-xs text-gray-400">(auto from supplies)</span>
                <div className="w-3 h-3 bg-gray-200 rounded-full flex items-center justify-center text-[8px] text-gray-500">i</div>
              </label>
              <input type="date" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2 disabled:bg-gray-100 cursor-not-allowed" value={form.lastDelivery || ''} onChange={e => setForm(f => ({ ...f, lastDelivery: e.target.value }))} disabled />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Delivery Success Rate (%)</label>
              <input type="number" min="0" max="100" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.deliverySuccess || ''} onChange={e => setForm(f => ({ ...f, deliverySuccess: e.target.value }))} placeholder="e.g. 97" />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes/Tags <span className="text-xs text-gray-400">(comma separated)</span></label>
            <input type="text" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Reliable partner, Quick response" />
          </div>
          
          {/* Success Message */}
          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-green-800 text-xs font-medium">{success}</span>
            </div>
          )}
          
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span className="text-red-800 text-xs font-medium">{error}</span>
            </div>
          )}
        </form>
        {/* Footer Border */}
        <div className="border-t border-gray-200 -mx-6"></div>
        
        {/* Action Buttons */}
        <div className="flex justify-end gap-2 mt-4 text-sm">
              <button 
                type="button" 
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors disabled:opacity-50" 
                onClick={onClose} 
                disabled={saving || isSubmitting}
              >
                Cancel
              </button>
              <button 
                type="button" 
                className="px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] flex items-center justify-center transition-colors disabled:opacity-50" 
                onClick={handleSubmit} 
                disabled={saving || isSubmitting}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
            </button>
        </div>
      </div>
    </div>
      )}

      {/* Success Modal - Rendered outside main modal so it persists after modal closes */}
      {showSuccessModal && (
        <div className="fixed inset-0 flex items-center justify-center z-[60] pointer-events-none">
          <div className="bg-green-600 text-white rounded-lg shadow-2xl p-4 flex items-center gap-4 animate-fade-in pointer-events-auto">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-md font-semibold">Changes Saved Successfully!</h3>
              <p className="text-xs text-white/90">
                {mode === 'edit' ? 'Supplier has been updated successfully.' : 'Supplier has been created successfully.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
