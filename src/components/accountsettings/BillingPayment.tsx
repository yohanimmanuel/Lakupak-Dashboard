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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Info,
} from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import { useSettingsTranslations } from '@/hooks/useSettingsTranslations';
import {
  SUBSCRIPTION_PLANS,
  formatPlanPrice,
  getPlanQuotaHighlights,
  isTrialPlan,
  planHasFixedPrice,
  type PlanQuotaHighlightKey,
} from '@/config/subscriptionPlans';
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
  buyerPaymentTermDays: number | '';
}

interface Invoice {
  id: string;
  invoiceNo: string;
  date: string;
  amount: number;
  status: 'paid' | 'pending' | 'overdue';
  dueDate: string | null;
  description: string;
  /** Document category shown in Documents tab. */
  documentType: 'subscription' | 'commission';
  documentUrl?: string;
  downloadName?: string;
  downloadUrl?: string;
}

type BillingPanelTab = 'billing' | 'payments' | 'documents';
type DocumentTypeFilter = 'all' | 'subscription' | 'commission';

type PaymentMethodFormKind = CompanyPaymentMethodKind;

interface PaymentMethodFormState {
  kind: PaymentMethodFormKind;
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
  cardNumber: '',
  expiryMonth: '',
  expiryYear: '',
  bankName: '',
  accountHolderName: '',
  accountNumber: '',
  ewalletProvider: '',
  isDefault: false,
});

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
    buyerPaymentTermDays: company.buyerPaymentTermDays ?? '',
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
  buyerPaymentTermDays?: number | null;
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
    buyerPaymentTermDays: company.buyerPaymentTermDays ?? null,
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
  if (row.kind === 'BANK_TRANSFER') {
    const parts = [
      row.bankName?.trim() || null,
      row.accountNumberLast4 ? `•••• ${row.accountNumberLast4}` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(' · ') : undefined;
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
  const { tBilling, translateInvoiceStatus } = useSettingsTranslations();
  const user = useUserStore((s) => s.user);
  const updateUser = useUserStore((s) => s.updateUser);

  const paymentKindOptions = useMemo(
    (): ReadonlyArray<{ value: PaymentMethodFormKind; label: string }> => [
      { value: 'CARD', label: tBilling('paymentKinds.card') },
      { value: 'BANK_TRANSFER', label: tBilling('paymentKinds.bankTransfer') },
      { value: 'EWALLET', label: tBilling('paymentKinds.ewallet') },
    ],
    [tBilling]
  );

  const paymentKindLabel = useCallback(
    (kind: PaymentMethodFormKind): string =>
      paymentKindOptions.find((o) => o.value === kind)?.label ?? tBilling('paymentKinds.card'),
    [paymentKindOptions, tBilling]
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
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
    buyerPaymentTermDays: '',
  });

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicePage, setInvoicePage] = useState(1);
  const invoicesPerPage = 3;

  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [showEditAddressModal, setShowEditAddressModal] = useState(false);
  const [showEditBankModal, setShowEditBankModal] = useState(false);
  const [billingPanelTab, setBillingPanelTab] = useState<BillingPanelTab>('billing');
  const [documentTypeFilter, setDocumentTypeFilter] = useState<DocumentTypeFilter>('all');
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentMethodFormState>(emptyPaymentMethodForm());
  const [showPaymentKindDropdown, setShowPaymentKindDropdown] = useState(false);
  const paymentKindDropdownRef = useRef<HTMLDivElement>(null);

  /** Full-page load (same idea as `loading` on sales/team page). */
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
        setOverlayMessage(tBilling('refreshing'));
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
            methodCount === 1
              ? tBilling('showingBillingDataSingular', { count: methodCount })
              : tBilling('showingBillingDataPlural', { count: methodCount })
          );
        }
      } catch (e) {
        const rawMessage = e instanceof Error ? e.message : '';
        const msg =
          rawMessage === 'Failed to load company billing data'
            ? tBilling('errors.loadCompanyBilling')
            : rawMessage === 'Failed to load payment methods'
              ? tBilling('errors.loadPaymentMethods')
              : rawMessage || tBilling('errors.loadBillingSettings');
        setError(msg);
        if (!skipPageLoad) {
          setOverlayMessage(tBilling('errorLoading'));
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
    [updateUser, tBilling]
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
    setOverlayMessage(tBilling('loading'));
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
  }, [user?.id, reloadBillingSettings, tBilling]);

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
                  : tBilling('invoices.defaultDescription')
              ).trim() || tBilling('invoices.defaultDescription')),
            documentType: 'commission' as const,
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
  }, [tBilling]);

  useEffect(() => {
    void reloadInvoices();
  }, [reloadInvoices]);

  const filteredInvoices = useMemo(() => {
    if (documentTypeFilter === 'all') return invoices;
    return invoices.filter((inv) => inv.documentType === documentTypeFilter);
  }, [invoices, documentTypeFilter]);
  const filteredInvoiceTotalRows = filteredInvoices.length;
  const filteredInvoiceTotalPages = Math.max(1, Math.ceil(filteredInvoiceTotalRows / invoicesPerPage));
  const filteredInvoiceFromRow =
    filteredInvoiceTotalRows === 0 ? 0 : (invoicePage - 1) * invoicesPerPage + 1;
  const filteredInvoiceToRow = Math.min(invoicePage * invoicesPerPage, filteredInvoiceTotalRows);
  const pagedInvoices = useMemo(() => {
    const start = (invoicePage - 1) * invoicesPerPage;
    return filteredInvoices.slice(start, start + invoicesPerPage);
  }, [filteredInvoices, invoicePage]);

  useEffect(() => {
    setInvoicePage(1);
  }, [documentTypeFilter]);

  useEffect(() => {
    if (invoicePage > filteredInvoiceTotalPages) {
      setInvoicePage(filteredInvoiceTotalPages);
    }
  }, [invoicePage, filteredInvoiceTotalPages]);

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
    setModalError(null);
    setShowAddPaymentModal(true);
  };

  const handleEditPaymentMethod = (id: string) => {
    const row = paymentMethods.find((m) => m.id === id);
    if (!row) return;
    setEditingPaymentId(id);
    setPaymentForm({
      kind: row.kind,
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
    setModalError(null);
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
        throw new Error(readApiErrorMessage(json) ?? tBilling('errors.deleteFailed'));
      }
      setSuccess(tBilling('success.paymentMethodDeleted'));
      await reloadBillingSettings({ withMainLoader: false, skipPageLoad: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : tBilling('errors.deleteFailed'));
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
        throw new Error(readApiErrorMessage(json) ?? tBilling('errors.updateFailed'));
      }
      setSuccess(tBilling('success.defaultPaymentUpdated'));
      await reloadBillingSettings({ withMainLoader: false, skipPageLoad: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : tBilling('errors.updateFailed'));
    }
  };

  const handleEditBillingAddress = () => {
    if (companyForDisplay) setBillingAddress(mapCompanyToBillingAddress(companyForDisplay));
    setModalError(null);
    setShowEditAddressModal(true);
  };

  const handleEditBillingBank = () => {
    if (companyForDisplay) setBillingBank(mapCompanyToBillingBank(companyForDisplay));
    setModalError(null);
    setShowEditBankModal(true);
  };

  const persistCompanyFields = async (partial: Record<string, string | number | null>) => {
    const companyId = companySnapshot?.id ?? companyFromSession?.id;
    if (!user?.id || !companyId) {
      throw new Error(tBilling('errors.companyNotLoaded'));
    }

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
      throw new Error(readApiErrorMessage(json) ?? tBilling('errors.saveFailed'));
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
    setModalError(null);
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
      setSuccess(tBilling('success.billingAddressUpdated'));
    } catch (err) {
      setModalError(err instanceof Error ? err.message : tBilling('errors.saveFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveBillingBank = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setModalError(null);
    try {
      if (billingBank.buyerPaymentTermDays !== '') {
        const termDays = Number(billingBank.buyerPaymentTermDays);
        if (!Number.isInteger(termDays) || termDays < 1) {
          throw new Error(tBilling('errors.paymentTermInvalid'));
        }
      }

      await persistCompanyFields({
        billingBankName: billingBank.bankName.trim() || null,
        billingBankAccountName: billingBank.accountName.trim() || null,
        billingBankAccountNumber: billingBank.accountNumber.trim() || null,
        buyerPaymentTermDays:
          billingBank.buyerPaymentTermDays === '' ? null : Number(billingBank.buyerPaymentTermDays),
      });
      setShowEditBankModal(false);
      setSuccess(tBilling('success.billingAccountUpdated'));
    } catch (err) {
      setModalError(err instanceof Error ? err.message : tBilling('errors.saveFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSavePaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    setIsLoading(true);
    setModalError(null);

    try {
      const payload: Record<string, unknown> = {
        userId: user.id,
        kind: paymentForm.kind,
        isDefault: paymentForm.isDefault,
      };

      if (paymentForm.kind === 'CARD') {
        const m = parseInt(paymentForm.expiryMonth, 10);
        const y = parseInt(paymentForm.expiryYear, 10);
        if (!Number.isFinite(m) || !Number.isFinite(y) || m < 1 || m > 12 || y < 2000 || y > 2100) {
          throw new Error(tBilling('errors.expiryInvalid'));
        }
        payload.expiryMonth = m;
        payload.expiryYear = y;

        const trimmedCard = paymentForm.cardNumber.trim();
        if (!editingPaymentId) {
          if (!last4FromCardNumberInput(trimmedCard)) {
            throw new Error(tBilling('errors.cardNumberRequired'));
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
        throw new Error(readApiErrorMessage(json) ?? tBilling('errors.saveFailed'));
      }

      setShowAddPaymentModal(false);
      setEditingPaymentId(null);
      setModalError(null);
      window.location.reload();
      return;
    } catch (err) {
      setModalError(err instanceof Error ? err.message : tBilling('errors.saveFailed'));
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
    setSuccess(tBilling('success.invoiceDownloaded', { invoiceNo: inv.invoiceNo || invoiceId }));
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
            <p className="text-gray-600">{tBilling('loading')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-black mb-2">{tBilling('title')}</h2>
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
                  {paymentMethods.length === 1
                    ? tBilling('paymentMethodsLoadedSingular', { count: paymentMethods.length })
                    : tBilling('paymentMethodsLoadedPlural', { count: paymentMethods.length })}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg w-fit">
          {(
            [
              { id: 'billing' as const, label: tBilling('panelTabs.billing') },
              { id: 'payments' as const, label: tBilling('panelTabs.payments') },
              { id: 'documents' as const, label: tBilling('panelTabs.documents') },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setBillingPanelTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                billingPanelTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {billingPanelTab === 'billing' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="mb-4">
                <h3 className="text-md font-semibold text-black mb-1">{tBilling('subscription.sectionTitle')}</h3>
                <p className="text-xs text-gray-600">{tBilling('subscription.sectionSubtitle')}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div className="p-3 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-black">{tBilling('subscription.currentPlan')}</h4>
                    <span className="px-2 py-0.5 text-xs font-medium text-green-700 bg-green-50 rounded-lg">
                      {tBilling('subscription.trialBadge')}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-black mb-1">{tBilling('subscription.trialPlanName')}</p>
                  <p className="text-xs text-gray-600">{tBilling('subscription.trialHint')}</p>
                </div>
                <div className="p-3 border border-gray-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-black">{tBilling('subscription.nextBilling')}</h4>
                    <Calendar className="h-4 w-4 text-gray-400" />
                  </div>
                  <p className="text-sm font-semibold text-black mb-1">{tBilling('subscription.nextBillingHint')}</p>
                  <p className="text-xs text-gray-500">{tBilling('subscription.comingSoonCta')}</p>
                </div>
              </div>

              <div className="p-3 border border-gray-200 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-black">{tBilling('payments.defaultPayment')}</h4>
                  <CreditCard className="h-4 w-4 text-gray-400" />
                </div>
                {defaultMethod ? (
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0 text-[#0a61d7]">{getPaymentIcon(defaultMethod.kind)}</div>
                    <div>
                      <p className="text-sm font-medium text-black mb-1">{paymentKindLabel(defaultMethod.kind)}</p>
                      {defaultMethodSubtitle ? (
                        <p className="text-xs text-gray-600">{defaultMethodSubtitle}</p>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600">{tBilling('payments.noDefaultPayment')}</p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="mb-4">
                <h3 className="text-md font-semibold text-black mb-1">{tBilling('subscription.plansTitle')}</h3>
                <p className="text-xs text-gray-600 mb-2">{tBilling('subscription.plansModalSubtitle')}</p>
                <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
                  <Info className="h-3.5 w-3.5 text-[#0a61d7] mt-0.5 shrink-0" />
                  <p className="text-[11px] text-gray-700 leading-snug">{tBilling('subscription.softCapNote')}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                {SUBSCRIPTION_PLANS.map((plan) => {
                  const isCurrent = isTrialPlan(plan);
                  const price = formatPlanPrice(plan, 'monthly', {
                    customLabel: tBilling('subscription.custom'),
                    freeLabel: tBilling('subscription.freePrice'),
                  });
                  const isEnterprise = plan.id === 'enterprise';
                  const highlights = getPlanQuotaHighlights(plan).map((item) => {
                    const count = item.params?.count;
                    if (item.key === 'products' && count === 'custom') {
                      return tBilling('subscription.quotaBullets.productsCustom');
                    }
                    if (item.key === 'salesAgents' && count === 'custom') {
                      return tBilling('subscription.quotaBullets.salesAgentsCustom');
                    }
                    if (item.key === 'drivers' && count === 'custom') {
                      return tBilling('subscription.quotaBullets.driversCustom');
                    }
                    return tBilling(
                      `subscription.quotaBullets.${item.key}` as `subscription.quotaBullets.${PlanQuotaHighlightKey}`,
                      item.params ?? {},
                    );
                  });
                  return (
                    <div
                      key={plan.id}
                      className={`relative rounded-lg border p-3 flex flex-col ${
                        isCurrent ? 'border-[#0a61d7] bg-blue-50/40' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <p className="text-sm font-semibold text-black">
                          {tBilling(`subscription.plans.${plan.id}.name`)}
                        </p>
                        {isCurrent && (
                          <span className="px-2 py-0.5 text-[10px] font-medium text-green-700 bg-green-50 rounded-lg shrink-0">
                            {tBilling('subscription.trialBadge')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mb-2">
                        {tBilling(`subscription.plans.${plan.id}.description`)}
                      </p>
                      <p className="text-sm font-bold text-black mb-1 whitespace-nowrap">
                        {price}
                        {planHasFixedPrice(plan) && !isCurrent && (
                          <span className="text-xs font-medium text-gray-500 ml-1">
                            {tBilling('subscription.perMonth')}
                          </span>
                        )}
                        {isCurrent && (
                          <span className="text-xs font-medium text-gray-500 ml-1">
                            {tBilling('subscription.forTrial')}
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-gray-500 mb-3">
                        {tBilling('subscription.connectionsLabel')}: {plan.connections}
                      </p>
                      <ul className="space-y-1 mb-3 flex-1">
                        {highlights.map((line, idx) => (
                          <li key={`${plan.id}-quota-${idx}`} className="flex items-start gap-1.5 text-[11px] text-gray-600">
                            <Check className="w-3 h-3 text-[#0a61d7] mt-0.5 shrink-0" />
                            {line}
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        disabled={isCurrent}
                        onClick={() => {
                          if (isCurrent) return;
                          setError(null);
                          setSuccess(tBilling('subscription.comingSoonCta'));
                        }}
                        className={`w-full py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          isCurrent
                            ? 'border border-[#0a61d7] text-[#0a61d7] bg-white cursor-default'
                            : isEnterprise
                              ? 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                              : 'bg-[#0a61d7] text-white hover:bg-[#0a52c0]'
                        }`}
                      >
                        {isCurrent
                          ? tBilling('subscription.currentPlanCta')
                          : isEnterprise
                            ? tBilling('subscription.contactSales')
                            : tBilling('subscription.upgrade')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {billingPanelTab === 'payments' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-md font-semibold text-black mb-1">{tBilling('payments.sectionTitle')}</h3>
                  <p className="text-xs text-gray-600">{tBilling('payments.sectionSubtitle')}</p>
                </div>
                <button
                  type="button"
                  onClick={handleAddPaymentMethod}
                  disabled={!companyForDisplay || isLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-[#0a61d7] text-white text-sm font-medium rounded-lg hover:bg-[#0a52c0] transition-colors disabled:opacity-50 self-start"
                >
                  <Plus className="h-4 w-4" />
                  {tBilling('payments.addPaymentMethod')}
                </button>
              </div>

              <h4 className="text-sm font-medium text-black mb-3">{tBilling('payments.paymentMethodsTitle')}</h4>
              <div className="space-y-3">
                {paymentMethods.length === 0 && (
                  <p className="text-sm text-gray-600">{tBilling('payments.empty')}</p>
                )}
                {paymentMethods.map((method) => {
                  const subtitle = paymentMethodSubtitle(method);
                  return (
                    <div
                      key={method.id}
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="shrink-0 text-[#0a61d7]">{getPaymentIcon(method.kind)}</div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium text-black">{paymentKindLabel(method.kind)}</span>
                            {method.isDefault && (
                              <span className="px-2 py-1 text-xs font-medium text-[#0a61d7] bg-blue-50 rounded">
                                {tBilling('payments.defaultBadge')}
                              </span>
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
                            title={tBilling('payments.setAsDefault')}
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleEditPaymentMethod(method.id)}
                          className="p-1 text-gray-400 hover:text-[#0a61d7] transition-colors"
                          title={tBilling('payments.edit')}
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeletePaymentMethod(method.id)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          title={tBilling('payments.delete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-md font-semibold text-black mb-1">{tBilling('billingAccount.sectionTitle')}</h3>
                  <p className="text-xs text-gray-600">{tBilling('billingAccount.sectionSubtitle')}</p>
                </div>
                <button
                  type="button"
                  onClick={handleEditBillingBank}
                  disabled={!companyForDisplay || isLoading}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <Edit className="h-4 w-4" />
                  {tBilling('billingAccount.editAccount')}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                    <Building2 className="h-4 w-4 text-gray-400" />
                    {tBilling('billingAccount.bankName')}
                  </label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                    <span className="text-xs text-gray-900">{billingBankDisplay.bankName || tBilling('billingAccount.emptyValue')}</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-2">{tBilling('billingAccount.accountHolder')}</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                    <span className="text-xs text-gray-900">{billingBankDisplay.accountName || tBilling('billingAccount.emptyValue')}</span>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-gray-700 mb-2">{tBilling('billingAccount.accountNumber')}</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                    <span className="text-xs text-gray-900">{billingBankDisplay.accountNumber || tBilling('billingAccount.emptyValue')}</span>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-gray-700 mb-2">{tBilling('billingAccount.termOfPaymentDays')}</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                    <span className="text-xs text-gray-900">
                      {companyForDisplay?.buyerPaymentTermDays
                        ? tBilling('billingAccount.termDaysValue', { days: companyForDisplay.buyerPaymentTermDays })
                        : tBilling('billingAccount.emptyValue')}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {tBilling('billingAccount.termHint')}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-md font-semibold text-black mb-1">{tBilling('billingAddress.sectionTitle')}</h3>
                  <p className="text-xs text-gray-600">{tBilling('billingAddress.sectionSubtitle')}</p>
                </div>
                <button
                  type="button"
                  onClick={handleEditBillingAddress}
                  disabled={!companyForDisplay || isLoading}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <Edit className="h-4 w-4" />
                  {tBilling('billingAddress.editAddress')}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                    <Building2 className="h-4 w-4 text-gray-400" />
                    {tBilling('billingAddress.companyName')}
                  </label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                    <span className="text-xs text-gray-900">{billingAddressDisplay.companyName || tBilling('billingAccount.emptyValue')}</span>
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    {tBilling('billingAddress.address')}
                  </label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                    <span className="text-xs text-gray-900">{billingAddressDisplay.address || tBilling('billingAccount.emptyValue')}</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-2">{tBilling('billingAddress.city')}</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                    <span className="text-xs text-gray-900">{billingAddressDisplay.city || tBilling('billingAccount.emptyValue')}</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-2">{tBilling('billingAddress.state')}</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                    <span className="text-xs text-gray-900">{billingAddressDisplay.state || tBilling('billingAccount.emptyValue')}</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-2">{tBilling('billingAddress.postalCode')}</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                    <span className="text-xs text-gray-900">{billingAddressDisplay.postalCode || tBilling('billingAccount.emptyValue')}</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-2">{tBilling('billingAddress.country')}</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                    <span className="text-xs text-gray-900">{billingAddressDisplay.country || tBilling('billingAccount.emptyValue')}</span>
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                    <Phone className="h-4 w-4 text-gray-400" />
                    {tBilling('billingAddress.phone')}
                  </label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center">
                    <span className="text-xs text-gray-900">{billingAddressDisplay.phone || tBilling('billingAccount.emptyValue')}</span>
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                    <Mail className="h-4 w-4 text-gray-400" />
                    {tBilling('billingAddress.email')}
                  </label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center">
                    <span className="text-xs text-gray-900">{billingAddressDisplay.email || tBilling('billingAccount.emptyValue')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {billingPanelTab === 'documents' && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-md font-semibold text-black">{tBilling('documents.sectionTitle')}</h3>
                  <span className="relative group inline-flex items-center">
                    <Info
                      tabIndex={0}
                      aria-describedby="documents-info-tooltip"
                      aria-label={tBilling('invoices.infoAriaLabel')}
                      className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0a61d7]/40 rounded"
                    />
                    <span
                      id="documents-info-tooltip"
                      role="tooltip"
                      className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-[340px] -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 text-[11px] leading-4 text-gray-700 shadow-xl opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                    >
                      <span className="block font-medium">{tBilling('invoices.policyTitle')}</span>
                      <span className="mt-1 block">
                        {tBilling('invoices.policyBody', {
                          dueDateLabel: tBilling('invoices.dueDateLabel'),
                          billingMonthEndLabel: tBilling('invoices.billingMonthEndLabel'),
                        })}
                      </span>
                      <span className="mt-2 block">
                        {tBilling('invoices.gracePeriod', {
                          gracePeriodLabel: tBilling('invoices.gracePeriodLabel'),
                        })}
                      </span>
                      <span className="mt-2 block text-red-700">
                        {tBilling('invoices.warning', {
                          warningLabel: tBilling('invoices.warningLabel'),
                          suspensionLabel: tBilling('invoices.suspensionLabel'),
                        })}
                      </span>
                    </span>
                  </span>
                </div>
                <p className="text-xs text-gray-600">{tBilling('documents.sectionSubtitle')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    { id: 'all' as const, label: tBilling('documents.filters.all') },
                    { id: 'subscription' as const, label: tBilling('documents.filters.subscription') },
                    { id: 'commission' as const, label: tBilling('documents.filters.commission') },
                  ] as const
                ).map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setDocumentTypeFilter(filter.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      documentTypeFilter === filter.id
                        ? 'border-[#0a61d7] bg-blue-50 text-[#0a61d7]'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={filteredInvoiceTotalRows === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  {tBilling('invoices.downloadAll')}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-100 text-gray-500 whitespace-nowrap">
                    <th className="text-left py-3 px-4 font-medium text-xs uppercase">{tBilling('documents.table.invoice')}</th>
                    <th className="text-left py-3 px-4 font-medium text-xs uppercase">{tBilling('documents.table.type')}</th>
                    <th className="text-left py-3 px-4 font-medium text-xs uppercase">{tBilling('documents.table.date')}</th>
                    <th className="text-left py-3 px-4 font-medium text-xs uppercase">{tBilling('documents.table.due')}</th>
                    <th className="text-left py-3 px-4 font-medium text-xs uppercase">{tBilling('documents.table.amount')}</th>
                    <th className="text-left py-3 px-4 font-medium text-xs uppercase">{tBilling('documents.table.status')}</th>
                    <th className="text-center py-3 px-4 font-medium text-xs uppercase">{tBilling('documents.table.action')}</th>
                  </tr>
                </thead>
                <tbody className="text-xs whitespace-nowrap">
                  {filteredInvoiceTotalRows === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-gray-500">
                        <Receipt className="w-8 h-8 mx-auto mb-3 text-gray-400" />
                        <p className="text-sm font-medium text-gray-900">{tBilling('documents.emptyTitle')}</p>
                        <p className="text-xs text-gray-500 mt-1">{tBilling('documents.emptyDescription')}</p>
                      </td>
                    </tr>
                  ) : (
                    pagedInvoices.map((invoice) => (
                      <tr
                        key={invoice.id}
                        className="border-b border-[#e6e6e6] transition hover:bg-gray-50"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Receipt className="h-3 w-3 text-gray-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-black">{invoice.invoiceNo}</p>
                              <p className="text-[11px] text-gray-500 truncate max-w-[220px]">{invoice.description}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded ${
                              invoice.documentType === 'subscription'
                                ? 'bg-blue-50 text-[#0a61d7]'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {invoice.documentType === 'subscription'
                              ? tBilling('documents.types.subscription')
                              : tBilling('documents.types.commission')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-gray-700">
                          {new Date(invoice.date).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-xs text-gray-700">
                          {invoice.dueDate
                            ? new Date(invoice.dueDate).toLocaleDateString()
                            : tBilling('invoices.noDueDate')}
                        </td>
                        <td className="py-3 px-4 text-xs font-semibold text-black">
                          Rp {invoice.amount.toLocaleString('id-ID')}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(invoice.status)}`}>
                            {translateInvoiceStatus(invoice.status)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleDownloadInvoice(invoice.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[#0a61d7] text-xs font-medium rounded hover:bg-blue-50 transition-colors"
                          >
                            <Download className="h-3.5 w-3.5" />
                            {tBilling('invoices.download')}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {filteredInvoiceTotalRows > 0 ? (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-gray-500">
                  {tBilling('invoices.showing', {
                    from: filteredInvoiceFromRow,
                    to: filteredInvoiceToRow,
                    total: filteredInvoiceTotalRows,
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setInvoicePage(Math.max(1, invoicePage - 1))}
                    disabled={invoicePage === 1}
                    className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={tBilling('invoices.previousPage')}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, filteredInvoiceTotalPages) }, (_, i) => {
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
                          aria-label={tBilling('invoices.goToPage', { page: pageNum })}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    {filteredInvoiceTotalPages > 5 && (
                      <>
                        {filteredInvoiceTotalPages > 6 ? <span className="px-2 text-gray-500">...</span> : null}
                        <button
                          type="button"
                          onClick={() => setInvoicePage(filteredInvoiceTotalPages)}
                          className={`px-3 py-1 text-sm rounded ${
                            invoicePage === filteredInvoiceTotalPages
                              ? 'bg-[#0a61d7] text-white'
                              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                          }`}
                          aria-label={tBilling('invoices.goToPage', { page: filteredInvoiceTotalPages })}
                        >
                          {filteredInvoiceTotalPages}
                        </button>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setInvoicePage(Math.min(filteredInvoiceTotalPages, invoicePage + 1))}
                    disabled={invoicePage === filteredInvoiceTotalPages}
                    className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={tBilling('invoices.nextPage')}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {showAddPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-black">
                {editingPaymentId ? tBilling('paymentMethodModal.editTitle') : tBilling('paymentMethodModal.addTitle')}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowPaymentKindDropdown(false);
                  setShowAddPaymentModal(false);
                  setEditingPaymentId(null);
                  setModalError(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSavePaymentMethod(e)} className="space-y-4">
              {modalError ? (
                <div className="flex items-start rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <AlertCircle className="mt-0.5 mr-2 h-4 w-4 shrink-0 text-red-600" />
                  <p className="text-sm text-red-700">{modalError}</p>
                </div>
              ) : null}
              <div>
                <label className="text-xs font-medium text-gray-700 mb-2 block">{tBilling('paymentMethodModal.type')}</label>
                <div className="flex items-center gap-3">
                  <div className="shrink-0 text-[#0a61d7]">{getPaymentIcon(paymentForm.kind)}</div>
                  <div ref={paymentKindDropdownRef} className="relative min-w-0 flex-1">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-1 rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-100"
                      onClick={() => setShowPaymentKindDropdown((v) => !v)}
                    >
                      <span className="truncate">{paymentKindLabel(paymentForm.kind)}</span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" />
                    </button>
                    {showPaymentKindDropdown && (
                      <div className="absolute left-0 right-0 z-20 mt-2 rounded-lg border border-[#e6e6e6] bg-white shadow">
                        {paymentKindOptions.map((opt) => (
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
                </div>
              </div>

              {paymentForm.kind === 'CARD' && (
                <>
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-2 block">{tBilling('paymentMethodModal.cardNumber')}</label>
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
                      placeholder={
                        editingPaymentId
                          ? tBilling('paymentMethodModal.cardNumberPlaceholderEdit')
                          : tBilling('paymentMethodModal.cardNumberPlaceholderNew')
                      }
                      required={!editingPaymentId}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      {editingPaymentId
                        ? tBilling('paymentMethodModal.cardNumberHintEdit')
                        : tBilling('paymentMethodModal.cardNumberHintNew')}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-2 block">{tBilling('paymentMethodModal.expiryMonth')}</label>
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
                        placeholder={tBilling('paymentMethodModal.expiryMonthPlaceholder')}
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-2 block">{tBilling('paymentMethodModal.expiryYear')}</label>
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
                        placeholder={tBilling('paymentMethodModal.expiryYearPlaceholder')}
                        required
                      />
                    </div>
                  </div>
                </>
              )}

              {paymentForm.kind === 'BANK_TRANSFER' && (
                <>
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-2 block">{tBilling('paymentMethodModal.bankName')}</label>
                    <input
                      type="text"
                      value={paymentForm.bankName}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, bankName: e.target.value }))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-900"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-2 block">{tBilling('paymentMethodModal.accountHolder')}</label>
                    <input
                      type="text"
                      value={paymentForm.accountHolderName}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, accountHolderName: e.target.value }))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-900"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-2 block">{tBilling('paymentMethodModal.accountNumber')}</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={paymentForm.accountNumber}
                      onChange={(e) => setPaymentForm((p) => ({ ...p, accountNumber: e.target.value }))}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-900"
                      placeholder={tBilling('paymentMethodModal.accountNumberPlaceholder')}
                      required
                    />
                  </div>
                </>
              )}

              {paymentForm.kind === 'EWALLET' && (
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-2 block">{tBilling('paymentMethodModal.ewalletProvider')}</label>
                  <input
                    type="text"
                    value={paymentForm.ewalletProvider}
                    onChange={(e) => setPaymentForm((p) => ({ ...p, ewalletProvider: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-900"
                    placeholder={tBilling('paymentMethodModal.ewalletProviderPlaceholder')}
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
                <span className="text-xs text-gray-800">{tBilling('paymentMethodModal.setAsDefault')}</span>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowPaymentKindDropdown(false);
                    setShowAddPaymentModal(false);
                    setEditingPaymentId(null);
                    setModalError(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {tBilling('paymentMethodModal.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#0a61d7] rounded-lg hover:bg-[#0a52c0] transition-colors disabled:opacity-50"
                >
                  {isLoading ? tBilling('paymentMethodModal.saving') : tBilling('paymentMethodModal.save')}
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
              <h3 className="text-lg font-semibold text-black">{tBilling('editBillingAccountModal.title')}</h3>
              <button type="button" onClick={() => { setShowEditBankModal(false); setModalError(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={(e) => void handleSaveBillingBank(e)} className="space-y-4">
              {modalError ? (
                <div className="flex items-start rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <AlertCircle className="mt-0.5 mr-2 h-4 w-4 shrink-0 text-red-600" />
                  <p className="text-sm text-red-700">{modalError}</p>
                </div>
              ) : null}
              <div>
                <label className="text-xs font-medium text-gray-700 mb-2 block">{tBilling('editBillingAccountModal.bankName')}</label>
                <input
                  type="text"
                  value={billingBank.bankName}
                  onChange={(e) => setBillingBank((p) => ({ ...p, bankName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-black"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-2 block">{tBilling('editBillingAccountModal.accountHolder')}</label>
                <input
                  type="text"
                  value={billingBank.accountName}
                  onChange={(e) => setBillingBank((p) => ({ ...p, accountName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-black"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-2 block">{tBilling('editBillingAccountModal.accountNumber')}</label>
                <input
                  type="text"
                  value={billingBank.accountNumber}
                  onChange={(e) => setBillingBank((p) => ({ ...p, accountNumber: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-black"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-2 block">{tBilling('editBillingAccountModal.termOfPaymentDays')}</label>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={billingBank.buyerPaymentTermDays}
                    onChange={(e) =>
                      setBillingBank((p) => ({
                        ...p,
                        buyerPaymentTermDays: e.target.value === '' ? '' : Number(e.target.value),
                      }))
                    }
                    placeholder={tBilling('editBillingAccountModal.termPlaceholder')}
                    className="w-full max-w-[120px] px-3 py-2 border border-gray-200 rounded-lg text-xs text-black"
                  />
                  <span className="text-xs text-gray-500">{tBilling('editBillingAccountModal.daysSuffix')}</span>
                </div>
                <p className="mt-1 text-[11px] text-gray-500">
                  {tBilling('editBillingAccountModal.termHint')}
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowEditBankModal(false); setModalError(null); }}
                  className="px-4 py-2 text-sm text-black border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {tBilling('editBillingAccountModal.cancel')}
                </button>
                <button type="submit" disabled={isLoading} className="px-4 py-2 text-sm bg-[#0a61d7] hover:bg-[#0a52c0] transition-colors text-white rounded-lg disabled:opacity-50">
                  {tBilling('editBillingAccountModal.save')}
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
              <h3 className="text-lg font-semibold text-black">{tBilling('editBillingAddressModal.title')}</h3>
              <button type="button" onClick={() => { setShowEditAddressModal(false); setModalError(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveBillingAddress(e)} className="space-y-4">
              {modalError ? (
                <div className="flex items-start rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                  <AlertCircle className="mt-0.5 mr-2 h-4 w-4 shrink-0 text-red-600" />
                  <p className="text-sm text-red-700">{modalError}</p>
                </div>
              ) : null}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                      <Building2 className="h-4 w-4 text-gray-400" />
                      {tBilling('editBillingAddressModal.companyName')}
                    </label>
                    <div className="px-3 py-2 border border-gray-200 rounded-lg flex items-center">
                      <input
                        type="text"
                        value={billingAddress.companyName}
                        onChange={(e) => setBillingAddress((prev) => ({ ...prev, companyName: e.target.value }))}
                        className="w-full bg-transparent text-xs text-gray-900 outline-none"
                        placeholder={tBilling('editBillingAddressModal.companyNamePlaceholder')}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                      <MapPin className="h-4 w-4 text-gray-400" />
                      {tBilling('editBillingAddressModal.address')}
                    </label>
                    <div className="px-3 py-2 border border-gray-200 rounded-lg flex items-center">
                      <input
                        type="text"
                        value={billingAddress.address}
                        onChange={(e) => setBillingAddress((prev) => ({ ...prev, address: e.target.value }))}
                        className="w-full bg-transparent text-xs text-gray-900 outline-none"
                        placeholder={tBilling('editBillingAddressModal.addressPlaceholder')}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-2">{tBilling('editBillingAddressModal.city')}</label>
                      <div className="px-3 py-2 border border-gray-200 rounded-lg flex items-center">
                        <input
                          type="text"
                          value={billingAddress.city}
                          onChange={(e) => setBillingAddress((prev) => ({ ...prev, city: e.target.value }))}
                          className="w-full bg-transparent text-xs text-gray-900 outline-none"
                          placeholder={tBilling('editBillingAddressModal.cityPlaceholder')}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-2">{tBilling('editBillingAddressModal.state')}</label>
                      <div className="px-3 py-2 border border-gray-200 rounded-lg flex items-center">
                        <input
                          type="text"
                          value={billingAddress.state}
                          onChange={(e) => setBillingAddress((prev) => ({ ...prev, state: e.target.value }))}
                          className="w-full bg-transparent text-xs text-gray-900 outline-none"
                          placeholder={tBilling('editBillingAddressModal.statePlaceholder')}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-2">{tBilling('editBillingAddressModal.postalCode')}</label>
                      <div className="px-3 py-2 border border-gray-200 rounded-lg flex items-center">
                        <input
                          type="text"
                          value={billingAddress.postalCode}
                          onChange={(e) => setBillingAddress((prev) => ({ ...prev, postalCode: e.target.value }))}
                          className="w-full bg-transparent text-xs text-gray-900 outline-none"
                          placeholder={tBilling('editBillingAddressModal.postalCodePlaceholder')}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-2">{tBilling('editBillingAddressModal.country')}</label>
                      <div className="px-3 py-2 border border-gray-200 rounded-lg flex items-center">
                        <input
                          type="text"
                          value={billingAddress.country}
                          onChange={(e) => setBillingAddress((prev) => ({ ...prev, country: e.target.value }))}
                          className="w-full bg-transparent text-xs text-gray-900 outline-none"
                          placeholder={tBilling('editBillingAddressModal.countryPlaceholder')}
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                      <Phone className="h-4 w-4 text-gray-400" />
                      {tBilling('editBillingAddressModal.phone')}
                    </label>
                    <div className="px-3 py-2 border border-gray-200 rounded-lg flex items-center">
                      <input
                        type="text"
                        value={billingAddress.phone}
                        onChange={(e) => setBillingAddress((prev) => ({ ...prev, phone: e.target.value }))}
                        className="w-full bg-transparent text-xs text-gray-900 outline-none"
                        placeholder={tBilling('editBillingAddressModal.phonePlaceholder')}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                      <Mail className="h-4 w-4 text-gray-400" />
                      {tBilling('editBillingAddressModal.email')}
                    </label>
                    <div className="px-3 py-2 border border-gray-200 rounded-lg flex items-center">
                      <input
                        type="email"
                        value={billingAddress.email}
                        onChange={(e) => setBillingAddress((prev) => ({ ...prev, email: e.target.value }))}
                        className="w-full bg-transparent text-xs text-gray-900 outline-none"
                        placeholder={tBilling('editBillingAddressModal.emailPlaceholder')}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => { setShowEditAddressModal(false); setModalError(null); }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {tBilling('editBillingAddressModal.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#0a61d7] rounded-lg hover:bg-[#0a52c0] transition-colors disabled:opacity-50"
                >
                  {tBilling('editBillingAddressModal.saveChanges')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
