'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, ChevronDown, ClipboardList, Clock, Plus, Save, Search, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useUserStore } from '@/store/userStore';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import CompleteSalesJobModal from './CompleteSalesJobModal';
import { OPEN_SALES_JOB_STATUSES, SALES_JOB_TYPES, type SalesJobCompletion, type SalesJobRow } from './salesJobTypes';

type AgentOption = { id: string; name: string; role: string; status: string };
type ClientOption = { buyerId: string; storeName: string; owner: string; phone: string; status: string };
type ProductOption = { productId: string; name: string; sku: string; images: string[]; productType: string };
type OrderOption = {
  orderId: string;
  storeName: string;
  contactPerson: string;
  buyerId: string | null;
  orderStatus: string;
  paymentStatus: string;
  totalAmount: number;
  orderDate: string;
};

type ScheduleDraft = { key: string; date: string; time: string };
type JobDraft = {
  key: string;
  jobType: string;
  clientIds: string[];
  orderIds: string[];
  productIds: string[];
  customerNumber: string;
  customerName: string;
  storeName: string;
  phone: string;
  address: string;
  reason: string;
  schedules: ScheduleDraft[];
  status: string;
};

const labelClass = 'block text-xs font-medium text-gray-700 mb-2';
const inputClass =
  'w-full px-3 py-2 text-black text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent bg-white';

function GreenCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={`w-4 h-4 border-2 rounded transition-all duration-200 flex items-center justify-center shrink-0 ${
        checked ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300'
      }`}
    >
      {checked && (
        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )}
    </span>
  );
}

function LakupakSelect({
  value,
  placeholder,
  options,
  allowEmpty = true,
  onChange,
}: {
  value: string;
  placeholder: string;
  options: { value: string; label: string }[];
  allowEmpty?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-black text-left flex items-center justify-between bg-white"
      >
        <span className={selected ? 'text-black' : 'text-gray-500'}>{selected?.label || placeholder}</span>
        <ChevronDown className="w-4 h-4 text-gray-400" />
      </button>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-[#e6e6e6] rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {allowEmpty && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-xs text-left hover:bg-gray-100 ${value === '' ? 'text-[#0a61d7] font-semibold bg-gray-50' : 'text-gray-500'}`}
            >
              {placeholder}
            </button>
          )}
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-xs text-left hover:bg-gray-100 ${
                value === option.value ? 'text-[#0a61d7] font-semibold bg-gray-50' : 'text-gray-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function newKey() {
  return Math.random().toString(36).slice(2);
}

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}

function blankSchedule(): ScheduleDraft {
  return { key: newKey(), date: todayKey(), time: '07:00' };
}

function blankJob(): JobDraft {
  return {
    key: newKey(),
    jobType: 'take_order',
    clientIds: [],
    orderIds: [],
    productIds: [],
    customerNumber: '',
    customerName: '',
    storeName: '',
    phone: '',
    address: '',
    reason: '',
    schedules: [blankSchedule()],
    status: 'pending',
  };
}

function parseTime(value: string) {
  const [hour, minute] = value.split(':').map((part) => Number(part));
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { reminderHour: hour, reminderMinute: minute };
}

function ClientMultiSelect({
  values,
  placeholder,
  options,
  onChange,
}: {
  values: string[];
  placeholder: string;
  options: { value: string; label: string }[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.filter((option) => values.includes(option.value));

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const toggle = (value: string) => {
    onChange(values.includes(value) ? values.filter((id) => id !== value) : [...values, value]);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] focus:border-transparent text-black text-left flex items-center justify-between gap-2 bg-white"
      >
        <span className={`truncate ${selected.length ? 'text-black' : 'text-gray-500'}`}>
          {selected.length ? selected.map((option) => option.label).join(', ') : placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-[#e6e6e6] rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {options.map((option) => {
            const checked = values.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggle(option.value)}
                className={`w-full px-3 py-2 text-xs text-left hover:bg-gray-100 flex items-center gap-2 ${
                  checked ? 'text-[#0a61d7] font-semibold bg-gray-50' : 'text-gray-700'
                }`}
              >
                <GreenCheckbox checked={checked} />
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OrderPicker({
  userId,
  purpose,
  selectedIds,
  onChange,
}: {
  userId: number;
  purpose: 'take_order' | 'collect_payment' | 'returns_pickup';
  selectedIds: string[];
  onChange: (orderIds: string[]) => void;
}) {
  const t = useTranslations('dashboard.sales.salesJobs');
  const currency = useUserStore((state) => state.user?.currency) || getDefaultCurrency();
  const [search, setSearch] = useState('');
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      fetchGraphQL<{ salesJobOrders: OrderOption[] }>(
        `query SalesJobOrders($userId: Int!, $purpose: String!, $search: String) {
          salesJobOrders(userId: $userId, purpose: $purpose, search: $search) {
            orderId storeName contactPerson buyerId orderStatus paymentStatus totalAmount orderDate
          }
        }`,
        { userId, purpose, search },
      )
        .then((result) => setOrders(result.salesJobOrders))
        .catch(() => setOrders([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [userId, purpose, search]);

  const toggle = (order: OrderOption) => {
    if (selectedIds.includes(order.orderId)) {
      onChange(selectedIds.filter((id) => id !== order.orderId));
      return;
    }
    onChange([...selectedIds, order.orderId]);
  };

  return (
    <div>
      <p className="text-xs text-gray-500 mb-2">
        {purpose === 'collect_payment' ? t('form.orderHintPay') : purpose === 'returns_pickup' ? t('form.orderHintReturn') : t('form.orderHintTake')}
      </p>
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('form.searchOrders')}
          className="w-full pl-10 pr-4 py-2 text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a61d7] text-sm"
        />
      </div>
      {selectedIds.length > 0 && (
        <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
          {t('form.selectedOrders', { count: selectedIds.length })}
        </div>
      )}
      <div className="max-h-72 overflow-y-auto border border-[#e6e6e6] rounded-lg">
        {loading ? (
          <p className="px-3 py-4 text-xs text-gray-500">{t('form.loadingOrders')}</p>
        ) : orders.length === 0 ? (
          <p className="px-3 py-4 text-xs text-gray-500">{t('form.noOrders')}</p>
        ) : (
          orders.map((order) => {
            const selected = selectedIds.includes(order.orderId);
            return (
              <button
                key={order.orderId}
                type="button"
                onClick={() => toggle(order)}
                className={`w-full text-left px-3 py-3 border-b border-[#e6e6e6] last:border-b-0 flex items-center gap-3 ${
                  selected ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'
                }`}
              >
                <GreenCheckbox checked={selected} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-gray-900">{order.orderId}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {order.storeName} · {order.contactPerson}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-semibold text-[#0a61d7]">{formatCurrency(order.totalAmount, currency)}</div>
                  <div className="text-xs text-gray-500">
                    {order.orderDate} · {order.paymentStatus}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function ProductPicker({
  products,
  selectedIds,
  hint,
  onChange,
}: {
  products: ProductOption[];
  selectedIds: string[];
  hint: string;
  onChange: (ids: string[]) => void;
}) {
  const t = useTranslations('dashboard.sales.salesJobs');
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query) ||
        product.productId.toLowerCase().includes(query),
    );
  }, [products, search]);

  const toggle = (productId: string) => {
    onChange(selectedIds.includes(productId) ? selectedIds.filter((id) => id !== productId) : [...selectedIds, productId]);
  };

  return (
    <div>
      <p className="text-xs text-gray-500 mb-2">{hint}</p>
      <div className="relative mb-2">
        <Search className="absolute left-3 top-2 text-gray-400 w-4 h-4" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('form.searchProducts')}
          className={`${inputClass} pl-9`}
        />
      </div>
      {selectedIds.length > 0 && (
        <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
          {t('form.selectedProducts', { count: selectedIds.length })}
        </div>
      )}
      {filtered.length === 0 ? (
        <p className="text-xs text-gray-500 py-6 text-center border border-dashed border-gray-300 rounded-lg">{t('form.noProducts')}</p>
      ) : (
        <div className="max-h-[420px] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map((product) => {
              const selected = selectedIds.includes(product.productId);
              const image = product.images?.[0] || '/placeholder-product.png';
              return (
                <button
                  key={product.productId}
                  type="button"
                  onClick={() => toggle(product.productId)}
                  className={`text-left border-2 rounded-lg overflow-hidden bg-white ${
                    selected ? 'border-green-500 bg-green-50' : 'border-[#e6e6e6] hover:border-gray-300'
                  }`}
                >
                  <div className="relative">
                    <img
                      src={image}
                      alt={product.name}
                      className="w-full h-28 object-cover bg-gray-50"
                      onError={(event) => {
                        (event.target as HTMLImageElement).src = '/placeholder-product.png';
                      }}
                    />
                    <span className="absolute top-2 right-2">
                      <GreenCheckbox checked={selected} />
                    </span>
                  </div>
                  <div className="p-3">
                    <div className="text-xs font-semibold text-gray-900 line-clamp-2">{product.name}</div>
                    <div className="text-xs text-gray-500 mt-1">{product.sku || product.productType}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function outletNumber(job: SalesJobRow): string {
  if (job.clientCustomerNumber) return job.clientCustomerNumber;
  const id = job.clientId || '';
  if (!id || id.startsWith('LKB-') || id.startsWith('LKP-') || id.startsWith('mobile_user_')) return '';
  return id;
}

const ORDER_JOB_TYPES = new Set(['take_order', 'collect_payment', 'returns_pickup']);

function scheduleSignature(job: SalesJobRow): string {
  const rows = job.schedules?.length ? job.schedules : [{ date: job.scheduledDate, reminderTime: '07:00' }];
  return rows
    .map((row) => `${row.date}|${row.reminderTime || '07:00'}`)
    .sort()
    .join(',');
}

function splitKey(job: SalesJobRow): string {
  return `${job.jobType}|${job.priorityReason || ''}|${scheduleSignature(job)}`;
}

/** The old save created one row per client from a single order job. Only those rows fold back together. */
function isOldClientSplit(existing: SalesJobRow, job: SalesJobRow): boolean {
  const left = existing.clientId?.trim() || '';
  const right = job.clientId?.trim() || '';
  if (!left || !right || left === right) return false;
  if (existing.status !== job.status) return false;
  if (existing.status === 'completed' || job.status === 'completed') return false;
  return true;
}

function combineSplitOrderJobs(rows: SalesJobRow[]): SalesJobRow[] {
  const combined: SalesJobRow[] = [];
  for (const job of rows) {
    if (!ORDER_JOB_TYPES.has(job.jobType)) {
      combined.push(job);
      continue;
    }
    const key = splitKey(job);
    const existingIndex = combined.findIndex(
      (existing) => ORDER_JOB_TYPES.has(existing.jobType) && splitKey(existing) === key && isOldClientSplit(existing, job),
    );
    if (existingIndex === -1) {
      combined.push({ ...job, orderIds: [...(job.orderIds ?? [])] });
      continue;
    }
    const existing = combined[existingIndex];
    const orderIds = Array.from(
      new Set([...(existing.orderIds ?? []), ...(job.orderIds ?? []), existing.orderId || '', job.orderId || ''].filter(Boolean)),
    );
    combined[existingIndex] = { ...existing, orderIds, orderId: orderIds[0] ?? existing.orderId };
  }
  return combined;
}

const SHARED_PRODUCT_JOB_TYPES = new Set(['promote_product', 'stock_check', 'new_product_activation']);

function productSignature(job: SalesJobRow): string {
  return [...(job.suggestedProducts ?? [])].slice().sort().join(',');
}

function clientIdsOf(job: SalesJobRow): string[] {
  if (job.jobType === 'stock_check') return [];
  const ids = [...(job.clientIds ?? []), job.clientId || ''].map((id) => id.trim()).filter(Boolean);
  return Array.from(new Set(ids));
}

/** Older saves stored one row per client. Same products fold back into one job. */
function combineSharedProductJobs(rows: SalesJobRow[]): SalesJobRow[] {
  const combined: SalesJobRow[] = [];
  for (const job of rows) {
    if (!SHARED_PRODUCT_JOB_TYPES.has(job.jobType)) {
      combined.push(job);
      continue;
    }
    const key = `${splitKey(job)}|${productSignature(job)}`;
    const existingIndex = combined.findIndex(
      (existing) =>
        SHARED_PRODUCT_JOB_TYPES.has(existing.jobType) &&
        `${splitKey(existing)}|${productSignature(existing)}` === key &&
        existing.status === job.status &&
        existing.status !== 'completed' &&
        job.status !== 'completed',
    );
    if (existingIndex === -1) {
      const clientIds = clientIdsOf(job);
      combined.push({ ...job, clientIds, clientId: clientIds[0] || job.clientId });
      continue;
    }
    const existing = combined[existingIndex];
    const clientIds = job.jobType === 'stock_check' ? [] : Array.from(new Set([...clientIdsOf(existing), ...clientIdsOf(job)]));
    combined[existingIndex] = { ...existing, clientIds, clientId: clientIds[0] || '' };
  }
  return combined;
}

function draftsFromRows(rows: SalesJobRow[]): JobDraft[] {
  return combineSharedProductJobs(combineSplitOrderJobs(rows)).map((job) => ({
    key: job.id,
    jobType: job.jobType,
    clientIds: job.jobType === 'stock_check' ? [] : clientIdsOf(job),
    orderIds: job.orderIds?.length ? job.orderIds : job.orderId ? [job.orderId] : [],
    productIds: job.suggestedProducts ?? [],
    customerNumber: job.jobType === 'prospect_new_outlet' ? outletNumber(job) : '',
    customerName: job.clientOwner || '',
    storeName: job.clientName,
    phone: job.clientPhone || '',
    address: job.clientAddress || '',
    reason: job.priorityReason || '',
    status: job.status,
    schedules: (job.schedules?.length ? job.schedules : [{ date: job.scheduledDate, reminderTime: '07:00' }]).map((row) => ({
      key: newKey(),
      date: row.date,
      time: row.reminderTime || '07:00',
    })),
  }));
}

export default function CreateSalesJobForm({
  editing,
}: {
  editing?: { assignedTo: string; replaceIds: string[]; jobs: SalesJobRow[] };
}) {
  const t = useTranslations('dashboard.sales.salesJobs');
  const router = useRouter();
  const user = useUserStore((state) => state.user);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [assignedTo, setAssignedTo] = useState(editing?.assignedTo ?? '');
  const [jobs, setJobs] = useState<JobDraft[]>(editing ? draftsFromRows(editing.jobs) : [blankJob()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [completingJobs, setCompletingJobs] = useState<SalesJobRow[]>([]);
  const [savedCompletions, setSavedCompletions] = useState<Record<string, SalesJobCompletion>>({});
  const [statusJobId, setStatusJobId] = useState<string | null>(null);
  const [jobErrors, setJobErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user?.id) return;
    fetchGraphQL<{
      salesJobFormOptions: { agents: AgentOption[]; clients: ClientOption[] };
      products: { nodes: ProductOption[] };
    }>(
      `query CreateJobOptions($userId: Int!) {
        salesJobFormOptions(userId: $userId) {
          agents { id name role status }
          clients { buyerId storeName owner phone status }
        }
        products(userId: $userId, page: 1, limit: 500) {
          nodes { productId name sku images productType }
        }
      }`,
      { userId: user.id },
    )
      .then((result) => {
        setAgents(result.salesJobFormOptions.agents);
        setClients(result.salesJobFormOptions.clients);
        setProducts(result.products.nodes);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [user?.id]);

  const updateJob = (key: string, patch: Partial<JobDraft>) => {
    setJobs((prev) => prev.map((job) => (job.key === key ? { ...job, ...patch } : job)));
  };

  const validate = () => {
    const next: Record<string, string> = {};
    for (const job of jobs) {
      const times = job.schedules.map((row) => parseTime(row.time));
      const datesOk = job.schedules.every((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && parseTime(row.time));
      const unique = new Set(job.schedules.map((row) => `${row.date} ${row.time}`));
      if (!datesOk || unique.size !== job.schedules.length || times.some((row) => !row)) {
        next[job.key] = t('form.needSchedule');
        continue;
      }
      if (job.jobType === 'take_order' || job.jobType === 'collect_payment' || job.jobType === 'returns_pickup') {
        if (job.orderIds.length === 0) next[job.key] = t('form.needOrder');
      } else if (job.jobType === 'stock_check') {
        if (job.productIds.length === 0) next[job.key] = t('form.needProduct');
      } else if (job.jobType === 'promote_product' || job.jobType === 'new_product_activation') {
        if (job.clientIds.length === 0) next[job.key] = t('form.needClient');
        else if (job.productIds.length === 0) next[job.key] = t('form.needProduct');
      } else if (job.jobType === 'competitor_intel' || job.jobType === 'scheme_reconciliation') {
        if (job.clientIds.length === 0) next[job.key] = t('form.needClient');
      } else if (!job.customerNumber.trim() || !job.customerName.trim() || !job.storeName.trim() || !job.phone.trim() || !job.address.trim()) {
        next[job.key] = t('form.needOutlet');
      }
    }
    const firstJobError = Object.values(next)[0] || '';
    if (!assignedTo) setError(t('form.needRep'));
    else setError(firstJobError);
    setJobErrors(next);
    return Boolean(assignedTo) && !firstJobError;
  };

  const save = async () => {
    if (!user?.id || saving) return;
    if (!validate()) return;
    setSaving(true);
    setError('');
    try {
      const jobsInput = jobs.map((job) => ({
            ...(editing?.replaceIds.includes(job.key) ? { id: job.key } : {}),
            jobType: job.jobType,
            priorityReason: job.reason.trim() || null,
            clientId: job.jobType === 'stock_check' ? null : job.clientIds[0] || null,
            clientIds: job.jobType === 'stock_check' ? [] : job.clientIds,
            orderIds: job.orderIds,
            productIds: job.productIds,
            ...(job.jobType === 'prospect_new_outlet'
              ? {
                  prospect: {
                    customerNumber: job.customerNumber.trim(),
                    name: job.customerName.trim(),
                    storeName: job.storeName.trim(),
                    phone: job.phone.trim(),
                    address: job.address.trim(),
                  },
                }
              : {}),
            schedules: job.schedules.map((row) => {
              const time = parseTime(row.time)!;
              return { scheduledDate: row.date, reminderHour: time.reminderHour, reminderMinute: time.reminderMinute };
            }),
          }));
      await fetchGraphQL(
        editing
          ? `mutation UpdateSalesJobs($userId: Int!, $assignedTo: String!, $replaceIds: [String!]!, $jobs: [CreateSalesJobItemInput!]!, $timeZone: String) {
              updateSalesJobs(userId: $userId, assignedTo: $assignedTo, replaceIds: $replaceIds, jobs: $jobs, timeZone: $timeZone) { id }
            }`
          : `mutation CreateSalesJobs($userId: Int!, $assignedTo: String!, $jobs: [CreateSalesJobItemInput!]!, $timeZone: String) {
              createSalesJobs(userId: $userId, assignedTo: $assignedTo, jobs: $jobs, timeZone: $timeZone) { id }
            }`,
        {
          userId: user.id,
          assignedTo,
          jobs: jobsInput,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...(editing ? { replaceIds: editing.replaceIds } : {}),
        },
      );
      router.push('/sales/jobs');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed';
      setError(
        message.includes('already exists')
          ? t('form.customerExists')
          : message,
      );
    } finally {
      setSaving(false);
    }
  };

  const completionRow = (draft: JobDraft): SalesJobRow => {
    const saved = editing?.jobs.find((job) => job.id === draft.key);
    const clientId = saved?.clientId || draft.clientIds[0] || '';
    const client = clients.find((row) => row.buyerId === clientId);
    const agent = agents.find((row) => row.id === assignedTo);
    const prospect = draft.jobType === 'prospect_new_outlet';
    const completionData: SalesJobCompletion = savedCompletions[draft.key] ?? saved?.completionData ?? {
      order_placed: false,
      order_amount: null,
      payment_collected: false,
      payment_amount: null,
      stock_checked: false,
      products_demoed: 0,
      notes: '',
    };
    return {
      id: draft.key,
      assignedTo,
      agentName: agent?.name || saved?.agentName || '',
      clientId,
      clientCustomerNumber: prospect ? draft.customerNumber : saved?.clientCustomerNumber || '',
      clientName: prospect ? draft.storeName : client?.storeName || saved?.clientName || '',
      clientOwner: prospect ? draft.customerName : client?.owner || saved?.clientOwner || '',
      clientPhone: prospect ? draft.phone : saved?.clientPhone || '',
      clientAddress: prospect ? draft.address : saved?.clientAddress || '',
      clientStatus: saved?.clientStatus || client?.status || '',
      jobType: draft.jobType,
      priorityReason: draft.reason || null,
      suggestedProducts: draft.productIds,
      suggestedProductNames: draft.productIds.map((productId) => {
        const savedIndex = (saved?.suggestedProducts ?? []).indexOf(productId);
        const fromSaved = savedIndex >= 0 ? saved?.suggestedProductNames?.[savedIndex] : '';
        return fromSaved || products.find((product) => product.productId === productId)?.name || productId;
      }),
      createdBy: saved?.createdBy || 'manager',
      status: draft.status || saved?.status || 'pending',
      scheduledDate: draft.schedules[0]?.date || saved?.scheduledDate || '',
      createdAt: saved?.createdAt || '',
      completionData,
      dispatchNote: saved?.dispatchNote ?? null,
    };
  };

  return (
    <div className="p-4 space-y-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => router.push('/sales/jobs')}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-black hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('form.backToJobs')}
          </button>
          <h1 className="text-2xl font-bold text-black">{editing ? t('form.editTitle') : t('form.pageTitle')}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] transition text-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? t('form.saving') : editing ? t('form.saveChanges') : t('form.saveJobs')}
          </button>
        </div>
      </div>

      {notice && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-xs text-green-700">{notice}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}

      <div className="bg-white rounded-lg border border-[#e6e6e6] p-4">
        <label className={labelClass}>
          {t('rep')} <span className="text-red-500">*</span>
        </label>
        <LakupakSelect
          value={assignedTo}
          placeholder={t('form.selectRep')}
          options={agents.map((agent) => ({ value: agent.id, label: agent.name }))}
          onChange={setAssignedTo}
        />
        <p className="text-xs text-gray-500 mt-2">{t('form.repHint')}</p>
      </div>

      {jobs.map((job, index) => {
        const savedJob = Boolean(editing?.replaceIds.includes(job.key));
        const isProspect = job.jobType === 'prospect_new_outlet';
        const canComplete = savedJob && !isProspect && (OPEN_SALES_JOB_STATUSES as readonly string[]).includes(job.status);
        return (
        <section key={job.key} className="bg-white rounded-lg border border-[#e6e6e6]">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#e6e6e6]">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-sm font-semibold text-gray-900">{t('form.jobNumber', { number: index + 1 })}</h2>
              {job.status === 'completed' && (
                <span className="inline-flex shrink-0 px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                  {t('status.completed')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {canComplete && (
                <button
                  type="button"
                  disabled={saving || statusJobId === job.key}
                  onClick={() => {
                    setError('');
                    setNotice('');
                    setCompletingJobs([completionRow(job)]);
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-[#e6e6e6] text-black font-medium hover:bg-gray-100 transition text-sm disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {t('complete')}
                </button>
              )}
              {savedJob && !isProspect && job.status === 'completed' && (
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setNotice('');
                    setCompletingJobs([completionRow(job)]);
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-[#e6e6e6] text-black font-medium hover:bg-gray-100 transition text-sm"
                >
                  <ClipboardList className="w-4 h-4" />
                  {t('viewCompletion')}
                </button>
              )}
              {savedJob && !isProspect && (
                <button
                  type="button"
                  disabled={saving || !user?.id || Boolean(statusJobId)}
                  onClick={() => {
                    if (!user?.id || statusJobId) return;
                    setStatusJobId(job.key);
                    setError('');
                    setNotice('');
                    void fetchGraphQL(
                      `mutation MarkPending($userId: Int!, $ids: [String!]!) { markSalesJobsPending(userId: $userId, ids: $ids) }`,
                      { userId: user.id, ids: [job.key] },
                    )
                      .then(() => {
                        updateJob(job.key, { status: 'pending' });
                        setNotice(t('markedPending'));
                      })
                      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Request failed'))
                      .finally(() => setStatusJobId(null));
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-[#e6e6e6] text-black font-medium hover:bg-gray-100 transition text-sm disabled:opacity-50"
                >
                  <Clock className="w-4 h-4" />
                  {t('pending')}
                </button>
              )}
              {jobs.length > 1 && (
                <button
                  type="button"
                  onClick={() => setJobs((prev) => prev.filter((row) => row.key !== job.key))}
                  className="text-xs font-medium text-red-600 hover:text-red-700"
                >
                  {t('form.removeJob')}
                </button>
              )}
            </div>
          </div>
          <div className="p-4 space-y-4">
            {jobErrors[job.key] && <p className="text-xs text-red-600">{jobErrors[job.key]}</p>}
            <div>
              <label className={labelClass}>
                {t('type')} <span className="text-red-500">*</span>
              </label>
              <LakupakSelect
                value={job.jobType}
                placeholder={t('type')}
                allowEmpty={false}
                options={[
                  ...SALES_JOB_TYPES.map((jobType) => ({
                    value: jobType,
                    label: t(`types.${jobType}` as 'types.take_order'),
                  })),
                  ...(job.jobType === 'scheme_reconciliation'
                    ? [{ value: 'scheme_reconciliation', label: t('types.scheme_reconciliation') }]
                    : []),
                ]}
                onChange={(jobType) => updateJob(job.key, { jobType, ...(jobType === 'stock_check' ? { clientIds: [] } : {}) })}
              />
            </div>

            {(job.jobType === 'take_order' || job.jobType === 'collect_payment' || job.jobType === 'returns_pickup') && user?.id && (
              <OrderPicker
                userId={user.id}
                purpose={job.jobType}
                selectedIds={job.orderIds}
                onChange={(orderIds) => updateJob(job.key, { orderIds })}
              />
            )}

            {(job.jobType === 'promote_product' ||
              job.jobType === 'new_product_activation' ||
              job.jobType === 'competitor_intel' ||
              job.jobType === 'scheme_reconciliation') && (
              <div>
                <label className={labelClass}>
                  {t('client')} <span className="text-red-500">*</span>
                </label>
                <ClientMultiSelect
                  values={job.clientIds}
                  placeholder={t('client')}
                  options={clients.map((client) => ({ value: client.buyerId, label: `${client.storeName} (${client.status})` }))}
                  onChange={(clientIds) => updateJob(job.key, { clientIds })}
                />
                <p className="text-xs text-gray-500 mt-2">
                  {job.jobType === 'promote_product' || job.jobType === 'new_product_activation'
                    ? t('form.clientHintShared')
                    : t('form.clientHint')}
                </p>
              </div>
            )}
            {(job.jobType === 'promote_product' || job.jobType === 'stock_check' || job.jobType === 'new_product_activation') && (
              <ProductPicker
                products={products}
                selectedIds={job.productIds}
                hint={
                  job.jobType === 'promote_product'
                    ? t('form.productHintPromote')
                    : job.jobType === 'new_product_activation'
                      ? t('form.productHintActivate')
                      : t('form.productHintStock')
                }
                onChange={(productIds) => updateJob(job.key, { productIds })}
              />
            )}

            {job.jobType === 'prospect_new_outlet' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>
                    {t('form.customerNumber')} <span className="text-red-500">*</span>
                  </label>
                  <input className={inputClass} maxLength={50} value={job.customerNumber} onChange={(event) => updateJob(job.key, { customerNumber: event.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>
                    {t('form.outletName')} <span className="text-red-500">*</span>
                  </label>
                  <input className={inputClass} maxLength={100} value={job.customerName} onChange={(event) => updateJob(job.key, { customerName: event.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>
                    {t('form.storeName')} <span className="text-red-500">*</span>
                  </label>
                  <input className={inputClass} maxLength={100} value={job.storeName} onChange={(event) => updateJob(job.key, { storeName: event.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>
                    {t('form.phone')} <span className="text-red-500">*</span>
                  </label>
                  <input className={inputClass} maxLength={20} value={job.phone} onChange={(event) => updateJob(job.key, { phone: event.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>
                    {t('form.address')} <span className="text-red-500">*</span>
                  </label>
                  <input className={inputClass} maxLength={500} value={job.address} onChange={(event) => updateJob(job.key, { address: event.target.value })} />
                </div>
              </div>
            )}

            <div>
              <label className={labelClass}>{t('reason')}</label>
              <input className={inputClass} value={job.reason} onChange={(event) => updateJob(job.key, { reason: event.target.value })} />
            </div>

            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <div>
                  <h3 className="text-xs font-medium text-gray-700">{t('form.schedulesTitle')}</h3>
                  <p className="text-xs text-gray-500 mt-1">{t('form.schedulesHint')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateJob(job.key, { schedules: [...job.schedules, blankSchedule()] })}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white border border-[#e6e6e6] text-xs font-medium text-black hover:bg-gray-100"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('form.addDate')}
                </button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-[#e6e6e6]">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-100 text-gray-500">
                      <th className="text-left py-2 px-3 font-medium text-xs uppercase">{t('date')}</th>
                      <th className="text-left py-2 px-3 font-medium text-xs uppercase">{t('form.reminder')}</th>
                      <th className="w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    {job.schedules.map((row) => (
                      <tr key={row.key} className="border-t border-[#e6e6e6]">
                        <td className="py-2 px-3">
                          <input
                            type="date"
                            className={inputClass}
                            value={row.date}
                            onChange={(event) =>
                              updateJob(job.key, {
                                schedules: job.schedules.map((item) => (item.key === row.key ? { ...item, date: event.target.value } : item)),
                              })
                            }
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="time"
                            className={inputClass}
                            value={row.time}
                            onChange={(event) =>
                              updateJob(job.key, {
                                schedules: job.schedules.map((item) => (item.key === row.key ? { ...item, time: event.target.value } : item)),
                              })
                            }
                          />
                        </td>
                        <td className="py-2 px-3 text-center">
                          {job.schedules.length > 1 && (
                            <button
                              type="button"
                              aria-label={t('form.removeDate')}
                              onClick={() => updateJob(job.key, { schedules: job.schedules.filter((item) => item.key !== row.key) })}
                              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
        );
      })}

      <button
        type="button"
        onClick={() =>
          setJobs((prev) => {
            const clientIds = prev.find((job) => job.clientIds.length > 0)?.clientIds ?? [];
            return [...prev, { ...blankJob(), clientIds: [...clientIds] }];
          })
        }
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-[#e6e6e6] text-sm font-medium text-black hover:bg-gray-100"
      >
        <Plus className="w-4 h-4" />
        {t('form.addJob')}
      </button>
      {completingJobs.length > 0 && (
        <CompleteSalesJobModal
          jobs={completingJobs}
          onClose={() => setCompletingJobs([])}
          onSaved={(completion) => {
            const ids = completingJobs.map((row) => row.id);
            const alreadyCompleted = completingJobs.every((row) => row.status === 'completed');
            setSavedCompletions((prev) => {
              const next = { ...prev };
              for (const id of ids) next[id] = completion;
              return next;
            });
            setCompletingJobs([]);
            setJobs((prev) => prev.map((row) => (ids.includes(row.key) ? { ...row, status: 'completed' } : row)));
            if (!alreadyCompleted) setNotice(t('markedComplete'));
          }}
        />
      )}
    </div>
  );
}
