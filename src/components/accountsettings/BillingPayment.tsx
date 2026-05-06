'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { CompanyPaymentMethodKind } from '@prisma/client';
import {
  CreditCard,
  Wallet,
  Receipt,
  Download,
  Plus,
  Trash2,
  Edit,
  Check,
  X,
  AlertCircle,
  Building2,
  MapPin,
  Phone,
  Mail,
  Calendar,
  Clock,
  Shield,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Info,
} from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import {
  isCompanyBillingApiResponse,
  isCompanyPaymentMethodApiRowArray,
  readApiErrorMessage,
  type CompanyBillingApiResponse,
  type CompanyPaymentMethodApiRow,
} from '@/components/accountsettings/billingSettingsGuards';

interface BillingAddressForm {
  companyName: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  email: string;
}

interface BillingBankAccountForm {
  bankName: string;
  accountName: string;
  accountNumber: string;
}

interface Invoice {
  id: string;
  invoiceNo: string;
  date: string;
  amount: number;
  status: 'paid' | 'pending' | 'overdue';
  dueDate: string | null;
  description: string;
  documentUrl?: string;
  downloadName?: string;
  downloadUrl?: string;
}

type PaymentMethodFormKind = CompanyPaymentMethodKind;

interface PaymentMethodFormState {
  kind: PaymentMethodFormKind;
  label: string;
  /** Full card number as entered; only last 4 digits are sent to the API. */
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  ewalletProvider: string;
  isDefault: boolean;
}

const emptyPaymentMethodForm = (): PaymentMethodFormState => ({
  kind: 'CARD',
  label: '',
  cardNumber: '',
  expiryMonth: '',
  expiryYear: '',
  bankName: '',
  accountHolderName: '',
  accountNumber: '',
  ewalletProvider: '',
  isDefault: false,
});

const PAYMENT_KIND_OPTIONS: ReadonlyArray<{ value: PaymentMethodFormKind; label: string }> = [
  { value: 'CARD', label: 'Card' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'EWALLET', label: 'E-wallet' },
];

function paymentKindLabel(kind: PaymentMethodFormKind): string {
  return PAYMENT_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? 'Card';
}

function last4FromCardNumberInput(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

function mapCompanyToBillingAddress(company: CompanyBillingApiResponse): BillingAddressForm {
  return {
    companyName: company.billingCompanyName ?? company.name ?? '',
    address: company.billingAddressLine1 ?? '',
    city: company.billingCity ?? '',
    state: company.billingState ?? '',
    postalCode: company.billingPostalCode ?? '',
    country: company.billingCountry ?? '',
    phone: company.billingContactPhone ?? '',
    email: company.billingContactEmail ?? '',
  };
}

function mapCompanyToBillingBank(company: CompanyBillingApiResponse): BillingBankAccountForm {
  return {
    bankName: company.billingBankName ?? '',
    accountName: company.billingBankAccountName ?? '',
    accountNumber: company.billingBankAccountNumber ?? '',
  };
}

/** Subset of session `user.company` used to mirror GET `/api/company` billing fields before the request returns. */
type SessionCompanyForBilling = {
  id: number;
  name: string;
  logo?: string | null;
  bannerImage?: string | null;
  businessAddress?: string | null;
  businessPhone?: string | null;
  businessEmail?: string | null;
  pickupAddress?: string | null;
  billingBankName?: string | null;
  billingBankAccountName?: string | null;
  billingBankAccountNumber?: string | null;
  billingCompanyName?: string | null;
  billingAddressLine1?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingPostalCode?: string | null;
  billingCountry?: string | null;
  billingContactPhone?: string | null;
  billingContactEmail?: string | null;
};

function companyBillingFromSessionCompany(company: SessionCompanyForBilling): CompanyBillingApiResponse | null {
  if (typeof company.id !== 'number' || !Number.isFinite(company.id) || company.id <= 0) {
    return null;
  }
  return {
    id: company.id,
    name: company.name,
    logo: company.logo ?? null,
    bannerImage: company.bannerImage ?? null,
    businessAddress: company.businessAddress ?? null,
    businessPhone: company.businessPhone ?? null,
    businessEmail: company.businessEmail ?? null,
    pickupAddress: company.pickupAddress ?? null,
    billingBankName: company.billingBankName ?? null,
    billingBankAccountName: company.billingBankAccountName ?? null,
    billingBankAccountNumber: company.billingBankAccountNumber ?? null,
    billingCompanyName: company.billingCompanyName ?? null,
    billingAddressLine1: company.billingAddressLine1 ?? null,
    billingCity: company.billingCity ?? null,
    billingState: company.billingState ?? null,
    billingPostalCode: company.billingPostalCode ?? null,
    billingCountry: company.billingCountry ?? null,
    billingContactPhone: company.billingContactPhone ?? null,
    billingContactEmail: company.billingContactEmail ?? null,
  };
}

function formatCardExpiry(month: number | null, year: number | null): string | undefined {
  if (month == null || year == null) return undefined;
  const mm = String(month).padStart(2, '0');
  const yy = String(year).slice(-2);
  return `${mm}/${yy}`;
}

function paymentMethodSubtitle(row: CompanyPaymentMethodApiRow): string | undefined {
  if (row.kind === 'CARD') {
    const exp = formatCardExpiry(row.expiryMonth, row.expiryYear);
    const tail = row.last4 ? `•••• ${row.last4}` : '';
    return [tail, exp].filter(Boolean).join(' · ') || undefined;
  }
  if (row.kind === 'BANK_TRANSFER' && row.accountNumberLast4) {
    return `Account ****${row.accountNumberLast4}`;
  }
  if (row.kind === 'EWALLET' && row.ewalletProvider) {
    return row.ewalletProvider;
  }
  return undefined;
}

async function fetchCompanyBillingData(userId: number): Promise<{
  company: CompanyBillingApiResponse;
  methods: CompanyPaymentMethodApiRow[];
}> {
  const [companyRes, pmRes] = await Promise.all([
    fetch(`/api/company?userId=${userId}`, { method: 'GET', credentials: 'include' }),
    fetch(`/api/company/payment-methods?userId=${userId}`, { method: 'GET', credentials: 'include' }),
  ]);

  const companyJson: unknown = await companyRes.json();
  if (!companyRes.ok || !isCompanyBillingApiResponse(companyJson)) {
    throw new Error(readApiErrorMessage(companyJson) ?? 'Failed to load company billing data');
  }

  const pmJson: unknown = await pmRes.json();
  if (!pmRes.ok || !isCompanyPaymentMethodApiRowArray(pmJson)) {
    throw new Error(readApiErrorMessage(pmJson) ?? 'Failed to load payment methods');
  }

  return { company: companyJson, methods: pmJson };
}

export default function BillingPayment() {
  const user = useUserStore((s) => s.user);
  const updateUser = useUserStore((s) => s.updateUser);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [companySnapshot, setCompanySnapshot] = useState<CompanyBillingApiResponse | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<CompanyPaymentMethodApiRow[]>([]);

  const [billingAddress, setBillingAddress] = useState<BillingAddressForm>({
    companyName: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
    phone: '',
    email: '',
  });

  const [billingBank, setBillingBank] = useState<BillingBankAccountForm>({
    bankName: '',
    accountName: '',
    accountNumber: '',
  });

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicePage, setInvoicePage] = useState(1);
  const invoicesPerPage = 3;

  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [showEditAddressModal, setShowEditAddressModal] = useState(false);
  const [showEditBankModal, setShowEditBankModal] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentMethodFormState>(emptyPaymentMethodForm());
  const [showPaymentKindDropdown, setShowPaymentKindDropdown] = useState(false);
  const paymentKindDropdownRef = useRef<HTMLDivElement>(null);

  /** Full-page load (same idea as `loading` on marketing/team page). */
  const [loading, setLoading] = useState(true);
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayMessage, setOverlayMessage] = useState('');
  const [isSlidingIn, setIsSlidingIn] = useState(false);
  const [isSlidingOut, setIsSlidingOut] = useState(false);
  const overlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const innerOverlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!showPaymentKindDropdown) return;
    const onDoc = (e: MouseEvent) => {
      const el = paymentKindDropdownRef.current;
      if (el && !el.contains(e.target as Node)) {
        setShowPaymentKindDropdown(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showPaymentKindDropdown]);

  const reloadBillingSettings = useCallback(
    async (opts?: { withMainLoader?: boolean; skipPageLoad?: boolean }) => {
      const uid = useUserStore.getState().user?.id;
      if (!uid) {
        setLoading(false);
        return;
      }

      const withMainLoader = opts?.withMainLoader !== false;
      const skipPageLoad = opts?.skipPageLoad === true;

      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
        overlayTimeoutRef.current = null;
      }
      if (innerOverlayTimeoutRef.current) {
        clearTimeout(innerOverlayTimeoutRef.current);
        innerOverlayTimeoutRef.current = null;
      }

      if (!skipPageLoad) {
        setLoading(true);
        setIsSlidingOut(false);
        setIsSlidingIn(true);
        setOverlayMessage('Refreshing billing data');
      }

      if (withMainLoader) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const { company, methods } = await fetchCompanyBillingData(uid);

        setCompanySnapshot(company);
        setBillingAddress(mapCompanyToBillingAddress(company));
        setBillingBank(mapCompanyToBillingBank(company));
        setPaymentMethods(methods);

        const current = useUserStore.getState().user;
        if (current?.company) {
          updateUser({
            companyId: company.id,
            company: {
              ...current.company,
              id: company.id,
              name: company.name,
              // Billing/bank/contact fields are intentionally not persisted in userStore/localStorage.
            },
          });
        } else if (current) {
          updateUser({ companyId: company.id });
        }

        if (!skipPageLoad) {
          const methodCount = methods.length;
          setOverlayMessage(
            `Showing billing data (${methodCount} payment method${methodCount !== 1 ? 's' : ''} loaded)`
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load billing settings');
        if (!skipPageLoad) {
          setOverlayMessage('Error loading billing');
        }
      } finally {
        if (withMainLoader) setIsLoading(false);
        setLoading(false);

        if (!skipPageLoad) {
          setTimeout(() => {
            setIsSlidingIn(false);
            setShowOverlay(true);
          }, 1500);

          overlayTimeoutRef.current = setTimeout(() => {
            setIsSlidingOut(true);
            setShowOverlay(false);
            innerOverlayTimeoutRef.current = setTimeout(() => {
              setIsSlidingOut(false);
              innerOverlayTimeoutRef.current = null;
            }, 500);
          }, 2500);
        }
      }
    },
    [updateUser]
  );

  useEffect(() => {
    if (overlayTimeoutRef.current) {
      clearTimeout(overlayTimeoutRef.current);
      overlayTimeoutRef.current = null;
    }
    if (innerOverlayTimeoutRef.current) {
      clearTimeout(innerOverlayTimeoutRef.current);
      innerOverlayTimeoutRef.current = null;
    }
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setIsSlidingIn(true);
    setOverlayMessage('Loading billing data...');
    void reloadBillingSettings({ withMainLoader: false });
    return () => {
      if (overlayTimeoutRef.current) {
        clearTimeout(overlayTimeoutRef.current);
        overlayTimeoutRef.current = null;
      }
      if (innerOverlayTimeoutRef.current) {
        clearTimeout(innerOverlayTimeoutRef.current);
        innerOverlayTimeoutRef.current = null;
      }
    };
  }, [user?.id, reloadBillingSettings]);

  const reloadInvoices = useCallback(async () => {
    const uid = useUserStore.getState().user?.id;
    if (!uid) return;
    try {
      const res = await fetch(`/api/company/commission-invoices?userId=${uid}`, { method: 'GET', credentials: 'include' });
      const json = (await res.json().catch(() => null)) as
        | {
            invoices: Array<{
              id: string;
              invoiceNo: string;
              issuedAt: string;
              amount: string;
              status: string;
              dueAt: string | null;
              description: string | null;
              documentUrl: string;
              downloadName?: string;
              downloadUrl?: string;
            }>;
          }
        | { error?: string }
        | null;
      const apiError =
        json && typeof json === 'object' && 'error' in json && typeof (json as { error?: unknown }).error === 'string'
          ? String((json as { error?: string }).error)
          : null;
      if (!res.ok) throw new Error(apiError || 'Failed to load invoices');
      const rows =
        json && typeof json === 'object' && 'invoices' in json && Array.isArray((json as { invoices?: unknown }).invoices)
          ? ((json as { invoices: Array<Record<string, unknown>> }).invoices ?? [])
          : [];
      const mapped: Invoice[] = rows
        .map((r) => {
          const amountNum = Number((r as { amount?: unknown }).amount);
          const statusRaw = String((r as { status?: unknown }).status ?? '').toLowerCase();
          const status: Invoice['status'] =
            statusRaw === 'paid' ? 'paid' : statusRaw === 'overdue' ? 'overdue' : 'pending';
          return {
            id: String((r as { id?: unknown }).id ?? ''),
            invoiceNo: String((r as { invoiceNo?: unknown }).invoiceNo ?? ''),
            date: String((r as { issuedAt?: unknown }).issuedAt ?? ''),
            amount: Number.isFinite(amountNum) ? amountNum : 0,
            status,
            dueDate: (r as { dueAt?: unknown }).dueAt ? String((r as { dueAt?: unknown }).dueAt) : null,
            description:
              ((
                (r as { description?: unknown }).description
                  ? String((r as { description?: unknown }).description)
                  : 'Commission fee invoice'
              ).trim() || 'Commission fee invoice'),
            documentUrl: String((r as { documentUrl?: unknown }).documentUrl ?? ''),
            downloadName: (r as { downloadName?: unknown }).downloadName ? String((r as { downloadName?: unknown }).downloadName) : undefined,
            downloadUrl: (r as { downloadUrl?: unknown }).downloadUrl ? String((r as { downloadUrl?: unknown }).downloadUrl) : undefined,
          };
        })
        .filter((x) => Boolean(x.id) && Boolean(x.invoiceNo));
      setInvoices(mapped);
      setInvoicePage(1);
    } catch (e) {
      // Non-blocking: invoice section can show empty state.
      console.error('Failed to load commission invoices', e);
      setInvoices([]);
      setInvoicePage(1);
    }
  }, []);

  useEffect(() => {
    void reloadInvoices();
  }, [reloadInvoices]);

  const invoiceTotalRows = invoices.length;
  const invoiceTotalPages = Math.max(1, Math.ceil(invoiceTotalRows / invoicesPerPage));
  const invoiceFromRow = invoiceTotalRows === 0 ? 0 : (invoicePage - 1) * invoicesPerPage + 1;
  const invoiceToRow = Math.min(invoicePage * invoicesPerPage, invoiceTotalRows);
  const pagedInvoices = useMemo(() => {
    const start = (invoicePage - 1) * invoicesPerPage;
    return invoices.slice(start, start + invoicesPerPage);
  }, [invoices, invoicePage]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const companyFromSession = useMemo(() => {
    const c = user?.company;
    if (!c?.id) return null;
    return companyBillingFromSessionCompany(c as SessionCompanyForBilling);
  }, [user?.company]);

  const companyForDisplay = companySnapshot ?? companyFromSession;

  const billingBankDisplay = companyForDisplay
    ? mapCompanyToBillingBank(companyForDisplay)
    : billingBank;

  const billingAddressDisplay = companyForDisplay
    ? mapCompanyToBillingAddress(companyForDisplay)
    : billingAddress;

  const defaultMethod = paymentMethods.find((m) => m.isDefault) ?? paymentMethods[0] ?? null;
  const defaultMethodSubtitle = defaultMethod ? paymentMethodSubtitle(defaultMethod) : undefined;

  const handleAddPaymentMethod = () => {
    setEditingPaymentId(null);
    setPaymentForm(emptyPaymentMethodForm());
    setShowPaymentKindDropdown(false);
    setShowAddPaymentModal(true);
  };

  const handleEditPaymentMethod = (id: string) => {
    const row = paymentMethods.find((m) => m.id === id);
    if (!row) return;
    setEditingPaymentId(id);
    setPaymentForm({
      kind: row.kind,
      label: row.label,
      cardNumber: '',
      expiryMonth: row.expiryMonth != null ? String(row.expiryMonth) : '',
      expiryYear: row.expiryYear != null ? String(row.expiryYear) : '',
      bankName: row.bankName ?? '',
      accountHolderName: row.accountHolderName ?? '',
      accountNumber: '',
      ewalletProvider: row.ewalletProvider ?? '',
      isDefault: row.isDefault,
    });
    setShowPaymentKindDropdown(false);
    setShowAddPaymentModal(true);
  };

  const handleDeletePaymentMethod = async (id: string) => {
    if (!user?.id) return;
    setError(null);
    try {
      const res = await fetch(`/api/company/payment-methods/${encodeURIComponent(id)}?userId=${user.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        throw new Error(readApiErrorMessage(json) ?? 'Delete failed');
      }
      setSuccess('Payment method deleted successfully');
      await reloadBillingSettings({ withMainLoader: false, skipPageLoad: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const handleSetDefaultPayment = async (id: string) => {
    if (!user?.id) return;
    setError(null);
    try {
      const res = await fetch(`/api/company/payment-methods/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: user.id, isDefault: true }),
      });
      const json: unknown = await res.json();
      if (!res.ok) {
        throw new Error(readApiErrorMessage(json) ?? 'Update failed');
      }
      setSuccess('Default payment method updated');
      await reloadBillingSettings({ withMainLoader: false, skipPageLoad: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const handleEditBillingAddress = () => {
    if (companyForDisplay) setBillingAddress(mapCompanyToBillingAddress(companyForDisplay));
    setShowEditAddressModal(true);
  };

  const handleEditBillingBank = () => {
    if (companyForDisplay) setBillingBank(mapCompanyToBillingBank(companyForDisplay));
    setShowEditBankModal(true);
  };

  const persistCompanyFields = async (partial: Record<string, string | null>) => {
    const companyId = companySnapshot?.id ?? companyFromSession?.id;
    if (!user?.id || !companyId) {
      setError('Company profile is not loaded yet');
      return;
    }

    setError(null);
    const res = await fetch('/api/company/update', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        companyId,
        ...partial,
      }),
    });

    const json: unknown = await res.json();
    if (!res.ok) {
      throw new Error(readApiErrorMessage(json) ?? 'Save failed');
    }

    if (isCompanyBillingApiResponse(json)) {
      setCompanySnapshot(json);
      const current = useUserStore.getState().user;
      if (current?.company) {
        updateUser({
          company: {
            ...current.company,
            id: json.id,
            name: json.name,
            // Billing/bank/contact fields are intentionally not persisted in userStore/localStorage.
          },
        });
      } else if (current) {
        updateUser({ companyId: json.id });
      }
    }
  };

  const handleSaveBillingAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await persistCompanyFields({
        billingCompanyName: billingAddress.companyName.trim() || null,
        billingAddressLine1: billingAddress.address.trim() || null,
        billingCity: billingAddress.city.trim() || null,
        billingState: billingAddress.state.trim() || null,
        billingPostalCode: billingAddress.postalCode.trim() || null,
        billingCountry: billingAddress.country.trim() || null,
        billingContactPhone: billingAddress.phone.trim() || null,
        billingContactEmail: billingAddress.email.trim() || null,
      });
      setShowEditAddressModal(false);
      setSuccess('Billing address updated successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveBillingBank = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await persistCompanyFields({
        billingBankName: billingBank.bankName.trim() || null,
        billingBankAccountName: billingBank.accountName.trim() || null,
        billingBankAccountNumber: billingBank.accountNumber.trim() || null,
      });
      setShowEditBankModal(false);
      setSuccess('Billing account updated successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSavePaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    setIsLoading(true);
    setError(null);
    const wasEditing = editingPaymentId !== null;

    try {
      const payload: Record<string, unknown> = {
        userId: user.id,
        kind: paymentForm.kind,
        label: paymentForm.label.trim(),
        isDefault: paymentForm.isDefault,
      };

      if (paymentForm.kind === 'CARD') {
        const m = parseInt(paymentForm.expiryMonth, 10);
        const y = parseInt(paymentForm.expiryYear, 10);
        if (!Number.isFinite(m) || !Number.isFinite(y) || m < 1 || m > 12) {
          throw new Error('Please enter valid expiry month (01-12) and year');
        }
        payload.expiryMonth = m;
        payload.expiryYear = y;

        const trimmedCard = paymentForm.cardNumber.trim();
        if (!editingPaymentId) {
          if (!last4FromCardNumberInput(trimmedCard)) {
            throw new Error(
              'Enter the full card number (at least 4 digits). Only the last 4 digits are stored.'
            );
          }
          payload.cardNumber = trimmedCard;
        } else if (trimmedCard) {
          payload.cardNumber = trimmedCard;
        }
      }

      if (paymentForm.kind === 'BANK_TRANSFER') {
        payload.bankName = paymentForm.bankName.trim();
        payload.accountHolderName = paymentForm.accountHolderName.trim();
        payload.accountNumber = paymentForm.accountNumber.trim();
      }

      if (paymentForm.kind === 'EWALLET') {
        payload.ewalletProvider = paymentForm.ewalletProvider.trim();
      }

      const url = editingPaymentId
        ? `/api/company/payment-methods/${encodeURIComponent(editingPaymentId)}`
        : '/api/company/payment-methods';
      const method = editingPaymentId ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const json: unknown = await res.json();
      if (!res.ok) {
        throw new Error(readApiErrorMessage(json) ?? 'Save failed');
      }

      setShowAddPaymentModal(false);
      setEditingPaymentId(null);
      setSuccess(wasEditing ? 'Payment method updated' : 'Payment method added');
      await reloadBillingSettings({ withMainLoader: false, skipPageLoad: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadInvoice = (invoiceId: string) => {
    const inv = invoices.find((x) => x.id === invoiceId);
    if (!inv) return;
    const a = document.createElement('a');
    a.href = `/api/company/commission-invoices/${encodeURIComponent(inv.id)}/download`;
    a.target = '_self';
    if (inv.downloadName) a.download = inv.downloadName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setSuccess(`Invoice ${inv.invoiceNo || invoiceId} downloaded successfully`);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
      case 'active':
        return 'text-green-600 bg-green-50';
      case 'pending':
        return 'text-yellow-600 bg-yellow-50';
      case 'overdue':
      case 'expired':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getPaymentIcon = (kind: CompanyPaymentMethodKind) => {
    switch (kind) {
      case 'CARD':
        return <CreditCard className="h-4 w-4" />;
      case 'BANK_TRANSFER':
        return <Building2 className="h-4 w-4" />;
      case 'EWALLET':
        return <Wallet className="h-4 w-4" />;
      default:
        return <CreditCard className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading billing data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-black mb-2">Billing & Payment</h2>
        <p className="text-sm text-gray-600">Manage your payment methods, billing information, and invoices</p>
      </div>

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center">
            <Check className="h-4 w-4 text-green-600 mr-2" />
            <span className="text-sm text-green-800">{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-green-600 hover:text-green-800" type="button">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center">
          <AlertCircle className="h-4 w-4 text-red-600 mr-2" />
          <span className="text-sm text-red-800">{error}</span>
        </div>
      )}

      {(showOverlay || isSlidingIn || isSlidingOut) && (
        <div
          className={`fixed top-20 right-6 z-50 bg-white border border-green-300 rounded-lg shadow-lg p-4 min-w-[280px] transform transition-all duration-500 ease-out ${
            isSlidingIn ? 'translate-x-0 opacity-100' : isSlidingOut ? 'translate-x-full opacity-0' : 'translate-x-full opacity-0'
          }`}
        >
          <div className="flex items-center gap-3">
            {loading ? (
              <div className="w-5 h-5 border-2 border-[#0a61d7] border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                <Check className="w-4 h-4 text-white" />
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-gray-900">{overlayMessage}</p>
              {!loading && (
                <p className="text-xs text-gray-500">
                  <span className="text-gray-400">{paymentMethods.length}</span> payment method
                  {paymentMethods.length !== 1 ? 's' : ''} loaded
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/*
        ================================================================================================
        | Subscription & Payment — entire section commented out (no subscription product yet).        |
        | Restore this block when subscriptions / saved payment methods in this UI are in scope.    |
        ================================================================================================
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-md font-semibold text-black mb-1">Subscription & Payment</h3>
              <p className="text-xs text-gray-600">Manage your subscription plan and payment methods</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
              >
                <Shield className="h-4 w-4" />
                Upgrade Plan
              </button>
              <button
                type="button"
                onClick={handleAddPaymentMethod}
                disabled={!companyForDisplay || isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-[#0a61d7] text-white text-sm font-medium rounded-lg hover:bg-[#0a52c0] transition-colors disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Add Payment Method
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-black">Current Plan</h4>
                <span className="px-2 py-1 text-xs font-medium text-green-600 bg-green-50 rounded-lg">Active</span>
              </div>
              <p className="text-sm font-bold text-black mb-1">Pro Plan</p>
              <p className="text-xs text-gray-600">Rp 1,500,000/month</p>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-black">Next Billing</h4>
                <Calendar className="h-4 w-4 text-gray-400" />
              </div>
              <p className="text-sm font-semibold text-black mb-1">March 15, 2024</p>
              <p className="text-xs text-gray-600">Auto-renewal enabled</p>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-black">Default Payment</h4>
                <CreditCard className="h-4 w-4 text-gray-400" />
              </div>
              {defaultMethod ? (
                <>
                  <p className="text-sm font-medium text-black mb-1">{defaultMethod.label}</p>
                  {defaultMethodSubtitle ? (
                    <p className="text-xs text-gray-600">{defaultMethodSubtitle}</p>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-gray-600">No payment method on file</p>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-black mb-4">Payment Methods</h4>
            <div className="space-y-3">
              {paymentMethods.length === 0 && (
                <p className="text-sm text-gray-600">No saved payment methods yet.</p>
              )}
              {paymentMethods.map((method) => {
                const subtitle = paymentMethodSubtitle(method);
                return (
                  <div
                    key={method.id}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-gray-100 rounded-lg">{getPaymentIcon(method.kind)}</div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-black">{method.label}</span>
                          {method.isDefault && (
                            <span className="px-2 py-1 text-xs font-medium text-[#0a61d7] bg-blue-50 rounded">Default</span>
                          )}
                        </div>
                        {subtitle ? <p className="text-xs text-gray-600">{subtitle}</p> : null}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(method.status)}`}>
                        {method.status.toLowerCase()}
                      </span>
                      {!method.isDefault && (
                        <button
                          type="button"
                          onClick={() => void handleSetDefaultPayment(method.id)}
                          className="p-1 text-gray-400 hover:text-[#0a61d7] transition-colors"
                          title="Set as default"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleEditPaymentMethod(method.id)}
                        className="p-1 text-gray-400 hover:text-[#0a61d7] transition-colors"
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeletePaymentMethod(method.id)}
                        className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        ================================================================================================
        */}

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-md font-semibold text-black">Invoices & Billing History</h3>
                <span className="relative group inline-flex items-center">
                  <Info
                    tabIndex={0}
                    aria-describedby="commission-invoices-info-tooltip"
                    aria-label="Invoices information"
                    className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0a61d7]/40 rounded"
                  />
                  <span
                    id="commission-invoices-info-tooltip"
                    role="tooltip"
                    className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-[340px] -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 text-[11px] leading-4 text-gray-700 shadow-xl opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                  >
                    <span className="block font-medium">
                      Payment policy
                    </span>
                    <span className="mt-1 block">
                      Please pay commission invoices by the <span className="font-semibold">due date</span> shown on the invoice.
                      If an invoice has no due date, treat the <span className="font-semibold">end of the billing month</span> as the deadline.
                    </span>
                    <span className="mt-2 block">
                      A <span className="font-semibold">14-day grace period</span> applies after the deadline.
                    </span>
                    <span className="mt-2 block text-red-700">
                      <span className="font-semibold">Warning:</span> invoices that remain unpaid after the grace period may result in a
                      <span className="font-semibold"> temporary account suspension</span> until payment is confirmed.
                    </span>
                  </span>
                </span>
              </div>
              <p className="text-xs text-gray-600">View and download our invoices to track your commission fees</p>
            </div>
            <button
              type="button"
              disabled={invoices.length === 0}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="h-4 w-4" />
              Download All
            </button>
          </div>

          <div className="space-y-3">
            {invoices.length === 0 ? (
              <div className="p-6 border border-dashed border-gray-200 rounded-lg bg-gray-50">
                <p className="text-sm font-medium text-gray-900">No invoices yet</p>
                <p className="text-xs text-gray-600 mt-1">
                  When the admin submits your monthly commission invoice, it will appear here.
                </p>
              </div>
            ) : null}
            {pagedInvoices.map((invoice) => (
              <div
                key={invoice.id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Receipt className="h-4 w-4 text-gray-600" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-black">{invoice.invoiceNo}</span>
                      <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(invoice.status)}`}>
                        {invoice.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mb-1">{invoice.description}</p>
                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                      <span className="flex items-center">
                        <Calendar className="h-3 w-3 mr-1" />
                        {new Date(invoice.date).toLocaleDateString()}
                      </span>
                      <span className="flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        {invoice.dueDate ? `Due: ${new Date(invoice.dueDate).toLocaleDateString()}` : 'No due date'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="text-right text-sm">
                    <div className="font-semibold text-black">Rp {invoice.amount.toLocaleString('id-ID')}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownloadInvoice(invoice.id)}
                    className="flex items-center gap-1 px-3 py-1 text-[#0a61d7] text-sm font-medium rounded hover:bg-blue-50 transition-colors"
                  >
                    <Download className="h-3 w-3" />
                    Download
                  </button>
                </div>
              </div>
            ))}
          </div>

          {invoiceTotalRows > 0 ? (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-gray-500">
                Showing {invoiceFromRow} to {invoiceToRow} of {invoiceTotalRows} invoices
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInvoicePage(Math.max(1, invoicePage - 1))}
                  disabled={invoicePage === 1}
                  className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, invoiceTotalPages) }, (_, i) => {
                    const pageNum = i + 1;
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setInvoicePage(pageNum)}
                        className={`px-3 py-2 text-sm rounded-lg ${
                          invoicePage === pageNum
                            ? 'bg-[#0a61d7] text-white'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                        }`}
                        aria-label={`Go to page ${pageNum}`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  {invoiceTotalPages > 5 && (
                    <>
                      {invoiceTotalPages > 6 ? <span className="px-2 text-gray-500">...</span> : null}
                      <button
                        type="button"
                        onClick={() => setInvoicePage(invoiceTotalPages)}
                        className={`px-3 py-1 text-sm rounded ${
                          invoicePage === invoiceTotalPages
                            ? 'bg-[#0a61d7] text-white'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                        }`}
                        aria-label={`Go to page ${invoiceTotalPages}`}
                      >
                        {invoiceTotalPages}
                      </button>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setInvoicePage(Math.min(invoiceTotalPages, invoicePage + 1))}
                  disabled={invoicePage === invoiceTotalPages}
                  className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Billing Account — bank details for buyer transfers & future platform billing */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-md font-semibold text-black mb-1">Billing Account</h3>
              <p className="text-xs text-gray-600">Bank account shown to buyers for bank transfer after ordering products on the marketplace</p>
            </div>
            <button
              type="button"
              onClick={handleEditBillingBank}
              disabled={!companyForDisplay || isLoading}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <Edit className="h-4 w-4" />
              Edit Account
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                <Building2 className="h-4 w-4 text-gray-400" />
                Bank name
              </label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                <span className="text-xs text-gray-900">{billingBankDisplay.bankName || '-'}</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 mb-2">Account holder</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                <span className="text-xs text-gray-900">{billingBankDisplay.accountName || '-'}</span>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-gray-700 mb-2">Account number</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                <span className="text-xs text-gray-900">{billingBankDisplay.accountNumber || '-'}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-md font-semibold text-black mb-1">Billing Address</h3>
              <p className="text-xs text-gray-600">Your billing information for invoices and receipts</p>
            </div>
            <button
              type="button"
              onClick={handleEditBillingAddress}
              disabled={!companyForDisplay || isLoading}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <Edit className="h-4 w-4" />
              Edit Address
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                  <Building2 className="h-4 w-4 text-gray-400" />
                  Company Name
                </label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center">
                  <span className="text-xs text-gray-900">{billingAddressDisplay.companyName || '-'}</span>
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  Address
                </label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center">
                  <span className="text-xs text-gray-900">{billingAddressDisplay.address || '-'}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-2">City</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center">
                    <span className="text-xs text-gray-900">{billingAddressDisplay.city || '-'}</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-2">State</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center">
                    <span className="text-xs text-gray-900">{billingAddressDisplay.state || '-'}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-2">Postal Code</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center">
                    <span className="text-xs text-gray-900">{billingAddressDisplay.postalCode || '-'}</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-2">Country</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center">
                    <span className="text-xs text-gray-900">{billingAddressDisplay.country || '-'}</span>
                  </div>
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                  <Phone className="h-4 w-4 text-gray-400" />
                  Phone
                </label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center">
                  <span className="text-xs text-gray-900">{billingAddressDisplay.phone || '-'}</span>
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                  <Mail className="h-4 w-4 text-gray-400" />
                  Email
                </label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center">
                  <span className="text-xs text-gray-900">{billingAddressDisplay.email || '-'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showAddPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-black">
                {editingPaymentId ? 'Edit Payment Method' : 'Add Payment Method'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowPaymentKindDropdown(false);
                  setShowAddPaymentModal(false);
                  setEditingPaymentId(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSavePaymentMethod(e)} className="space-y-4">
              <div ref={paymentKindDropdownRef} className="relative">
                <label className="text-xs font-medium text-gray-700 mb-2 block">Type</label>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-1 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100"
                  onClick={() => setShowPaymentKindDropdown((v) => !v)}
                >
                  <span className="flex items-center gap-1 min-w-0">
                    <span className="truncate">{paymentKindLabel(paymentForm.kind)}</span>
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
                </button>
                {showPaymentKindDropdown && (
                  <div className="absolute left-0 right-0 z-20 mt-2 rounded-lg border border-[#e6e6e6] bg-white shadow">
                    {PAYMENT_KIND_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setPaymentForm((prev) => ({ ...prev, kind: opt.value }));
                          setShowPaymentKindDropdown(false);
                        }}
                        className={`w-full px-4 py-2 text-left text-xs first:rounded-t-lg last:rounded-b-lg ${
                          paymentForm.kind === opt.value
                            ? 'font-semibold text-[#0a61d7] hover:bg-gray-100'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-gray-700 mb-2 block">Display label</label>
                <input
                  type="text"
                  value={paymentForm.label}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, label: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-900"
                  placeholder="e.g. Corporate Visa"
                  required
                />
              </div>

              {paymentForm.kind === 'CARD' && (
                <>
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-2 block">Card number</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="cc-number"
                      value={paymentForm.cardNumber}
                      onChange={(e) =>
                        setPaymentForm((p) => ({
                          ...p,
                          cardNumber: e.target.value.replace(/\D/g, '').slice(0, 19),
                        }))
                      }
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-900"
                      placeholder={editingPaymentId ? 'Leave blank to keep current card on file' : 'Full card number'}
                      required={!editingPaymentId}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      {editingPaymentId
                        ? 'Optional when editing: enter a new full number to replace the stored last 4.'
                        : 'Only the last 4 digits are stored on our servers.'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-2 block">Expiry month</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={2}
                        value={paymentForm.expiryMonth}
                        onChange={(e) =>
                          setPaymentForm((p) => ({
                            ...p,
                            expiryMonth: e.target.value.replace(/\D/g, '').slice(0, 2),
                          }))
                        }
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-900"
                        placeholder="MM"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-2 block">Expiry year</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={paymentForm.expiryYear}
                        onChange={(e) =>
                          setPaymentForm((p) => ({
                            ...p,
                            expiryYear: e.target.value.replace(/\D/g, '').slice(0, 4),
                          }))
                        }
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-900"
                        placeholder="YYYY"
                        required
                      />
                    </div>
                  </div>
                </>
              )}

              {paymentForm.kind === 'BANK_TRANSFER' && (
                <>
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-2 block">Bank name</label>
                    <input
                      type="text"
                      value={paymentForm.bankName}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, bankName: e.target.value }))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-900"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-2 block">Account holder</label>
                    <input
                      type="text"
                      value={paymentForm.accountHolderName}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, accountHolderName: e.target.value }))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-900"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-2 block">Account number</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={paymentForm.accountNumber}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, accountNumber: e.target.value }))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-900"
                      placeholder="Digits only; last 4 are stored for display"
                      required
                    />
                  </div>
                </>
              )}

              {paymentForm.kind === 'EWALLET' && (
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-2 block">E-wallet provider</label>
                  <input
                    type="text"
                    value={paymentForm.ewalletProvider}
                    onChange={(e) => setPaymentForm((p) => ({ ...p, ewalletProvider: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-900"
                    placeholder="e.g. OVO, GoPay, DANA"
                    required
                  />
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={paymentForm.isDefault}
                  onClick={() => setPaymentForm((p) => ({ ...p, isDefault: !p.isDefault }))}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-all duration-200 ${
                    paymentForm.isDefault
                      ? 'border-green-500 bg-green-500'
                      : 'border-gray-300 bg-white hover:border-green-400'
                  }`}
                >
                  {paymentForm.isDefault && (
                    <svg className="h-2.5 w-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
                <span className="text-xs text-gray-800">Set as default payment method</span>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowPaymentKindDropdown(false);
                    setShowAddPaymentModal(false);
                    setEditingPaymentId(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#0a61d7] rounded-lg hover:bg-[#0a52c0] transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditBankModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 w-full max-w-lg mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-black">Edit Billing Account</h3>
              <button type="button" onClick={() => setShowEditBankModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={(e) => void handleSaveBillingBank(e)} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-700 mb-2 block">Bank name</label>
                <input
                  type="text"
                  value={billingBank.bankName}
                  onChange={(e) => setBillingBank((p) => ({ ...p, bankName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-black"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-2 block">Account holder</label>
                <input
                  type="text"
                  value={billingBank.accountName}
                  onChange={(e) => setBillingBank((p) => ({ ...p, accountName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-black"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-2 block">Account number</label>
                <input
                  type="text"
                  value={billingBank.accountNumber}
                  onChange={(e) => setBillingBank((p) => ({ ...p, accountNumber: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-black"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditBankModal(false)}
                  className="px-4 py-2 text-sm text-black border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button type="submit" disabled={isLoading} className="px-4 py-2 text-sm bg-[#0a61d7] hover:bg-[#0a52c0] transition-colors text-white rounded-lg disabled:opacity-50">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditAddressModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-black">Edit Billing Address</h3>
              <button type="button" onClick={() => setShowEditAddressModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveBillingAddress(e)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                      <Building2 className="h-4 w-4 text-gray-400" />
                      Company Name
                    </label>
                    <div className="px-3 py-2 border border-gray-200 rounded-lg flex items-center">
                      <input
                        type="text"
                        value={billingAddress.companyName}
                        onChange={(e) => setBillingAddress((prev) => ({ ...prev, companyName: e.target.value }))}
                        className="w-full bg-transparent text-xs text-gray-900 outline-none"
                        placeholder="Enter company name"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                      <MapPin className="h-4 w-4 text-gray-400" />
                      Address
                    </label>
                    <div className="px-3 py-2 border border-gray-200 rounded-lg flex items-center">
                      <input
                        type="text"
                        value={billingAddress.address}
                        onChange={(e) => setBillingAddress((prev) => ({ ...prev, address: e.target.value }))}
                        className="w-full bg-transparent text-xs text-gray-900 outline-none"
                        placeholder="Enter address"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-2">City</label>
                      <div className="px-3 py-2 border border-gray-200 rounded-lg flex items-center">
                        <input
                          type="text"
                          value={billingAddress.city}
                          onChange={(e) => setBillingAddress((prev) => ({ ...prev, city: e.target.value }))}
                          className="w-full bg-transparent text-xs text-gray-900 outline-none"
                          placeholder="Enter city"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-2">State</label>
                      <div className="px-3 py-2 border border-gray-200 rounded-lg flex items-center">
                        <input
                          type="text"
                          value={billingAddress.state}
                          onChange={(e) => setBillingAddress((prev) => ({ ...prev, state: e.target.value }))}
                          className="w-full bg-transparent text-xs text-gray-900 outline-none"
                          placeholder="Enter state"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-2">Postal Code</label>
                      <div className="px-3 py-2 border border-gray-200 rounded-lg flex items-center">
                        <input
                          type="text"
                          value={billingAddress.postalCode}
                          onChange={(e) => setBillingAddress((prev) => ({ ...prev, postalCode: e.target.value }))}
                          className="w-full bg-transparent text-xs text-gray-900 outline-none"
                          placeholder="Enter postal code"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-2">Country</label>
                      <div className="px-3 py-2 border border-gray-200 rounded-lg flex items-center">
                        <input
                          type="text"
                          value={billingAddress.country}
                          onChange={(e) => setBillingAddress((prev) => ({ ...prev, country: e.target.value }))}
                          className="w-full bg-transparent text-xs text-gray-900 outline-none"
                          placeholder="Enter country"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                      <Phone className="h-4 w-4 text-gray-400" />
                      Phone
                    </label>
                    <div className="px-3 py-2 border border-gray-200 rounded-lg flex items-center">
                      <input
                        type="text"
                        value={billingAddress.phone}
                        onChange={(e) => setBillingAddress((prev) => ({ ...prev, phone: e.target.value }))}
                        className="w-full bg-transparent text-xs text-gray-900 outline-none"
                        placeholder="Enter phone number"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                      <Mail className="h-4 w-4 text-gray-400" />
                      Email
                    </label>
                    <div className="px-3 py-2 border border-gray-200 rounded-lg flex items-center">
                      <input
                        type="email"
                        value={billingAddress.email}
                        onChange={(e) => setBillingAddress((prev) => ({ ...prev, email: e.target.value }))}
                        className="w-full bg-transparent text-xs text-gray-900 outline-none"
                        placeholder="Enter email address"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowEditAddressModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#0a61d7] rounded-lg hover:bg-[#0a52c0] transition-colors disabled:opacity-50"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
