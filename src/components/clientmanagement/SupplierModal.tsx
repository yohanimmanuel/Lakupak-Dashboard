'use client';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Trash, AlertCircle, CheckCircle, ChevronDown, ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/store/userStore';
import { Supplier, SupplyDetail, SupplierFormData } from '@/types/client';
import { getDefaultCurrency, getCurrencySymbol } from '@/utils/currencyUtils';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';
import {
  validateRequiredEmail,
  validateRequiredPhone,
  validateRequiredField,
  mapSupplierFieldError,
  clearValidationField,
} from '@/utils/client-input-validation';
import { ClientField, ClientInput } from '@/components/clientmanagement/ClientField';
import { ClientValidatedField } from '@/components/clientmanagement/ClientValidatedField';
import { CLIENT_SELECT_BUTTON_CLASS } from '@/components/clientmanagement/client-field-styles';

const categories = ["Instant Noodles", "Mineral Water", "Rice", "Bread"];
const statusOptions = ["Active", "Inactive", "Blocked"];

function generateSupplierId() {
  return 'LKS-' + Math.floor(10000000 + Math.random() * 90000000).toString();
}

interface SupplierModalProps {
  initialData?: Supplier;
  mode?: 'edit' | 'add';
  onSave?: (data: SupplierFormData) => void;
}

export default function SupplierModal({ initialData, mode = 'add', onSave }: SupplierModalProps) {
  const router = useRouter();
  const user = useUserStore(state => state.user);
  const { tSuppliersModal, tShared, translateStatus } = useClientsTranslations();
  const isEditMode = mode === 'edit';

  // Get currency for display - safe to use on both server and client
  const userCurrency = user?.currency || getDefaultCurrency();
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
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
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

  // Compute lastDelivery during render (not in useEffect) - follows React best practices
  // Use computed value directly instead of storing in state
  const computedLastDelivery = useMemo(() => {
    return getLatestDeliveryDate(supplyRows);
  }, [supplyRows, getLatestDeliveryDate]);

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

    const supplierNameResult = validateRequiredField(form.supplierName, tSuppliersModal('supplierName'));
    const contactResult = validateRequiredField(form.contact, tSuppliersModal('contactPerson'));
    const phoneResult = validateRequiredPhone(form.phone);
    const emailResult = validateRequiredEmail(form.email);
    const addressResult = validateRequiredField(form.address, tSuppliersModal('address'));

    if (!supplierNameResult.valid && supplierNameResult.error) errors.supplierName = supplierNameResult.error;
    if (!contactResult.valid && contactResult.error) errors.contact = contactResult.error;
    if (!phoneResult.valid && phoneResult.error) errors.phone = phoneResult.error;
    if (!emailResult.valid && emailResult.error) errors.email = emailResult.error;
    if (!addressResult.valid && addressResult.error) errors.address = addressResult.error;

    setValidationErrors(errors);
    setSubmitAttempted(true);
    return Object.keys(errors).length === 0;
  }, [form.supplierName, form.contact, form.phone, form.email, form.address, tSuppliersModal]);

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

  // Hydrate form when initialData is provided (edit)
  useEffect(() => {
    if (!initialData || !isEditMode) return;

    const parsedNotes = safeParseJSON(initialData.notes || '', []);
    const parsedLogistics = safeParseJSON(initialData.logistics || '', {});

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
    setValidationErrors({});
    setError('');
    setSuccess('');
    setSubmitAttempted(false);
  }, [initialData, isEditMode, safeParseJSON, getLatestDeliveryDate]);

  // Enhanced form submission
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (isSubmitting || isNavigating) return;

    setError('');
    setSuccess('');

    if (!validateForm()) return;

    setIsSubmitting(true);
    setSaving(true);
    
    try {
      const payload: Record<string, unknown> = {
        ...form,
        supplierId: id,
        name: form.supplierName,

        supplies: JSON.stringify(supplyRows),
        notes: JSON.stringify(form.notes.split(',').map((n: string) => n.trim())),
        createdAt: isEditMode ? (form.createdAt ? new Date(form.createdAt).toISOString() : new Date().toISOString()) : new Date().toISOString(),
        logistics: JSON.stringify({
          preferredDays: form.preferredDays || '',
          lastDelivery: computedLastDelivery || '',
          deliverySuccess: form.deliverySuccess || ''
        }),
        userId: user?.id,
      };
      if (isEditMode && initialData && typeof initialData.id === 'number') {
        payload.id = initialData.id;
      }
      delete payload.supplierName;
      delete payload.preferredDays;
      delete payload.lastDelivery;
      delete payload.deliverySuccess;
      
      // Debug: Log the payload being sent
      // Supplier payload prepared for submission
      
      let savedSupplier: Supplier | null = null;
      
      if (isEditMode) {
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
        onSave?.(savedSupplier as unknown as SupplierFormData);
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
        onSave?.(savedSupplier as unknown as SupplierFormData);
      }

      const routeId = savedSupplier?.supplierId || String(payload.supplierId || '');
      setIsNavigating(true);
      setShowSuccessModal(true);
      setTimeout(() => {
        setShowSuccessModal(false);
        if (routeId) {
          router.push(`/clients/suppliers/details/${encodeURIComponent(routeId)}`);
        } else {
          router.push('/clients/suppliers');
        }
      }, 1200);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : tSuppliersModal('saveFailed');
      const field = mapSupplierFieldError(errorMessage);
      if (field) {
        setValidationErrors((prev) => ({ ...prev, [field]: errorMessage }));
        setSubmitAttempted(true);
      } else {
        handleError(errorMessage);
      }
    } finally {
      setSaving(false);
      setIsSubmitting(false);
    }
  }, [form, id, supplyRows, isEditMode, initialData, user?.id, onSave, router, validateForm, handleError, isSubmitting, isNavigating, tSuppliersModal, computedLastDelivery]);

  return (
    <>
      <div className="flex w-full min-w-0 flex-col overflow-hidden rounded-lg border border-[#e6e6e6] bg-white p-4">
        <div className="mb-4 flex flex-col gap-3 border-b border-[#e6e6e6] pb-4 @5xl/main:flex-row @5xl/main:items-center @5xl/main:justify-between">
          <div className="flex min-w-0 flex-col gap-3 @3xl/main:flex-row @3xl/main:items-center">
            <Link
              href={isEditMode && initialData?.supplierId ? `/clients/suppliers/details/${encodeURIComponent(initialData.supplierId)}` : '/clients/suppliers'}
              className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg px-3 py-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800 @3xl/main:w-auto @3xl/main:justify-start"
            >
              <ArrowLeft className="h-4 w-4" />
              {tSuppliersModal('back')}
            </Link>
            <h1 className="truncate text-2xl font-bold text-gray-900">
              {isEditMode ? tSuppliersModal('editTitle') : tSuppliersModal('addTitle')}
            </h1>
          </div>
          <div className="flex w-full min-w-0 flex-col gap-2 @4xl/main:flex-row @4xl/main:flex-wrap @4xl/main:items-center @5xl/main:w-auto">
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0a61d7] px-4 py-2 font-semibold text-white transition-colors hover:bg-[#084ba6] disabled:cursor-not-allowed disabled:opacity-50 @4xl/main:w-auto"
              onClick={handleSubmit}
              disabled={saving || isSubmitting || isNavigating}
            >
              {saving ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {tSuppliersModal('saving')}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {tSuppliersModal('save')}
                </>
              )}
            </button>
          </div>
        </div>
        <form className="flex flex-col gap-2">
          <div className="mt-0">
            <ClientField
              label={tShared('columns.id')}
              value={id || ''}
              onChange={setId}
              required
              disabled
            />
          </div>
          <ClientField
            label={tSuppliersModal('supplierName')}
            value={form.supplierName || ''}
            onChange={(supplierName) => {
              setForm((f) => ({ ...f, supplierName }));
              setValidationErrors((prev) => clearValidationField(prev, 'supplierName'));
            }}
            validator={(value) => validateRequiredField(value, tSuppliersModal('supplierName'))}
            submitAttempted={submitAttempted}
            externalError={validationErrors.supplierName}
            required
          />
          <ClientField
            label={tSuppliersModal('contactPerson')}
            value={form.contact || ''}
            onChange={(contact) => {
              setForm((f) => ({ ...f, contact }));
              setValidationErrors((prev) => clearValidationField(prev, 'contact'));
            }}
            validator={(value) => validateRequiredField(value, tSuppliersModal('contactPerson'))}
            submitAttempted={submitAttempted}
            externalError={validationErrors.contact}
            required
          />
          <div className="flex gap-2">
            <ClientValidatedField
              className="flex-1"
              label={tSuppliersModal('phone')}
              type="tel"
              value={form.phone || ''}
              onChange={(phone) => {
                setForm((f) => ({ ...f, phone }));
                setValidationErrors((prev) => clearValidationField(prev, 'phone'));
              }}
              validator={validateRequiredPhone}
              required
              submitAttempted={submitAttempted}
              externalError={validationErrors.phone}
            />
            <ClientValidatedField
              className="flex-1"
              label={tSuppliersModal('email')}
              type="email"
              value={form.email || ''}
              onChange={(email) => {
                setForm((f) => ({ ...f, email }));
                setValidationErrors((prev) => clearValidationField(prev, 'email'));
              }}
              validator={validateRequiredEmail}
              required
              submitAttempted={submitAttempted}
              externalError={validationErrors.email}
            />
          </div>
          <div className="flex gap-2">
            <ClientField
              className="flex-1"
              label={tSuppliersModal('businessType')}
              value={form.businessType || ''}
              onChange={(businessType) => setForm((f) => ({ ...f, businessType }))}
              placeholder={tSuppliersModal('businessTypePlaceholder')}
            />
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">{tSuppliersModal('status')}</label>
              <div className="relative" ref={statusDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                  className={CLIENT_SELECT_BUTTON_CLASS}
                >
                  <span className={form.status ? 'text-black' : 'text-gray-500'}>
                    {form.status ? translateStatus(form.status) : tSuppliersModal('selectStatus')}
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
                        {translateStatus(status)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <ClientField
            label={tSuppliersModal('address')}
            value={form.address || ''}
            onChange={(address) => {
              setForm((f) => ({ ...f, address }));
              setValidationErrors((prev) => clearValidationField(prev, 'address'));
            }}
            validator={(value) => validateRequiredField(value, tSuppliersModal('address'))}
            submitAttempted={submitAttempted}
            externalError={validationErrors.address}
            required
            rows={3}
          />
          {/* Supplies & Product Data Table */}
          <div className="my-2 border-t border-gray-200 pt-2">
            <label className="block text-sm font-bold text-black mb-2">{tSuppliersModal('suppliesSection')}</label>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-xs font-medium text-left bg-white">
                <thead>
                  <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                    <th className="py-2 px-3 font-medium uppercase">{tSuppliersModal('colNo')}</th>
                    <th className="py-2 px-3 font-medium uppercase">{tSuppliersModal('colSku')}</th>
                    <th className="py-2 px-3 font-medium uppercase">{tSuppliersModal('colProduct')}</th>
                    <th className="py-2 px-3 font-medium uppercase">{tSuppliersModal('colTotalSupplied')}</th>
                    <th className="py-2 px-3 font-medium uppercase">{tSuppliersModal('colTotalValue')}</th>
                    <th className="py-2 px-3 font-medium uppercase">{tSuppliersModal('colLastDelivery')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {supplyRows.map((row: SupplyDetail, idx: number) => (
                    <tr key={idx} className="whitespace-nowrap">
                      <td className="py-2 px-3 font-medium text-black">{idx + 1}</td>
                      <td className="py-2 px-3">
                        <ClientInput
                          value={row.sku || ''}
                          onChange={(sku) => handleSupplyChange(idx, 'sku', sku)}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <ClientInput
                          value={row.product || ''}
                          onChange={(product) => handleSupplyChange(idx, 'product', product)}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <ClientInput
                          type="number"
                          value={row.totalSupplied || ''}
                          onChange={(totalSupplied) => handleSupplyChange(idx, 'totalSupplied', totalSupplied)}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center">
                          <span className="mr-2 text-xs text-gray-500 font-medium">{currencySymbol}</span>
                          <ClientInput
                            fullWidth={false}
                            className="flex-1 min-w-0"
                            value={row.totalValue || ''}
                            onChange={(totalValue) => handleSupplyChange(idx, 'totalValue', totalValue)}
                            placeholder="0"
                          />
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <ClientInput
                          type="date"
                          value={row.lastDelivery || ''}
                          onChange={(lastDelivery) => handleSupplyChange(idx, 'lastDelivery', lastDelivery)}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <button type="button" className="text-red-500 font-bold p-1 hover:bg-red-100 rounded-full" onClick={() => deleteSupplyRow(idx)} disabled={supplyRows.length === 1}><Trash className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="mt-2 px-3 py-1 rounded-lg bg-[#0a61d7] text-white text-xs font-semibold hover:bg-[#084ba6]" onClick={addSupplyRow}>{tSuppliersModal('addRow')}</button>
          </div>
          <div className="flex gap-2">
            <ClientField
              className="flex-1"
              label={
                <span className="flex items-center gap-1">
                  {tSuppliersModal('createdAt')}
                  <span className="text-xs text-gray-400 font-normal">{tSuppliersModal('autoGenerated')}</span>
                  <span className="w-3 h-3 bg-gray-200 rounded-full flex items-center justify-center text-[8px] text-gray-500">i</span>
                </span>
              }
              type="date"
              value={form.createdAt || ''}
              onChange={(createdAt) => setForm((f) => ({ ...f, createdAt }))}
              required
              disabled
            />
            <ClientField
              className="flex-1"
              label={tSuppliersModal('preferredDeliveryDays')}
              value={form.preferredDays || ''}
              onChange={(preferredDays) => setForm((f) => ({ ...f, preferredDays }))}
              placeholder={tSuppliersModal('preferredDaysPlaceholder')}
            />
          </div>
          <div className="flex gap-2">
            <ClientField
              className="flex-1"
              label={
                <span className="flex items-center gap-1">
                  {tSuppliersModal('lastDeliveryDate')}
                  <span className="text-xs text-gray-400 font-normal">{tSuppliersModal('autoFromSupplies')}</span>
                  <span className="w-3 h-3 bg-gray-200 rounded-full flex items-center justify-center text-[8px] text-gray-500">i</span>
                </span>
              }
              type="date"
              value={computedLastDelivery || ''}
              onChange={(lastDelivery) => setForm((f) => ({ ...f, lastDelivery }))}
              disabled
            />
            <ClientField
              className="flex-1"
              label={tSuppliersModal('deliverySuccessRate')}
              type="number"
              min={0}
              max={100}
              value={form.deliverySuccess || ''}
              onChange={(deliverySuccess) => setForm((f) => ({ ...f, deliverySuccess }))}
              placeholder={tSuppliersModal('deliverySuccessPlaceholder')}
            />
          </div>
          <ClientField
            className="mb-4"
            label={
              <>
                {tSuppliersModal('notesTags')}{' '}
                <span className="text-xs text-gray-400 font-normal">{tSuppliersModal('commaSeparated')}</span>
              </>
            }
            value={form.notes || ''}
            onChange={(notes) => setForm((f) => ({ ...f, notes }))}
            placeholder={tSuppliersModal('notesPlaceholder')}
          />
          
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
      </div>

      {showSuccessModal && (
        <div className="fixed inset-0 flex items-center justify-center z-[60] pointer-events-none">
          <div className="bg-green-600 text-white rounded-lg shadow-2xl p-4 flex items-center gap-4 animate-fade-in pointer-events-auto">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-md font-semibold">{tSuppliersModal('saveSuccessTitle')}</h3>
              <p className="text-xs text-white/90">
                {isEditMode ? tSuppliersModal('saveSuccessEdit') : tSuppliersModal('saveSuccessCreate')}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
