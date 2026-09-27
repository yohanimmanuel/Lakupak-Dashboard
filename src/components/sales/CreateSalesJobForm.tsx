'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronDown, Plus, Search, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useUserStore } from '@/store/userStore';
import { formatCurrency, getDefaultCurrency } from '@/utils/currencyUtils';
import { SALES_JOB_TYPES, type SalesJobRow } from './salesJobTypes';

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
  clientId: string;
  orderIds: string[];
  productIds: string[];
  customerNumber: string;
  customerName: string;
  storeName: string;
  phone: string;
  address: string;
  reason: string;
  schedules: ScheduleDraft[];
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
  onChange,
}: {
  value: string;
  placeholder: string;
  options: { value: string; label: string }[];
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
    clientId: '',
    orderIds: [],
    productIds: [],
    customerNumber: '',
    customerName: '',
    storeName: '',
    phone: '',
    address: '',
    reason: '',
    schedules: [blankSchedule()],
  };
}

function parseTime(value: string) {
  const [hour, minute] = value.split(':').map((part) => Number(part));
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { reminderHour: hour, reminderMinute: minute };
}

function OrderPicker({
  userId,
  purpose,
  selectedIds,
  onChange,
}: {
  userId: number;
  purpose: 'take_order' | 'collect_payment';
  selectedIds: string[];
  onChange: (orderIds: string[]) => void;
}) {
  const t = useTranslations('dashboard.sales.salesJobs');
  const currency = useUserStore((state) => state.user?.currency) || getDefaultCurrency();
  const [search, setSearch] = useState('');
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [knownBuyers, setKnownBuyers] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

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
        .then((result) => {
          setOrders(result.salesJobOrders);
          setKnownBuyers((current) => {
            const next = { ...current };
            result.salesJobOrders.forEach((order) => {
              next[order.orderId] = order.buyerId;
            });
            return next;
          });
        })
        .catch(() => setOrders([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [userId, purpose, search]);

  const lockedBuyerId = selectedIds.length > 0 ? (knownBuyers[selectedIds[0]] ?? null) : undefined;

  const toggle = (order: OrderOption) => {
    if (selectedIds.includes(order.orderId)) {
      onChange(selectedIds.filter((id) => id !== order.orderId));
      setNotice('');
      return;
    }
    const incomingBuyerId = order.buyerId ?? null;
    if (
      lockedBuyerId === null ||
      (lockedBuyerId !== undefined && (incomingBuyerId === null || incomingBuyerId !== lockedBuyerId))
    ) {
      setNotice(t('form.sameClient'));
      return;
    }
    setNotice('');
    onChange([...selectedIds, order.orderId]);
  };

  return (
    <div>
      <p className="text-xs text-gray-500 mb-2">{purpose === 'collect_payment' ? t('form.orderHintPay') : t('form.orderHintTake')}</p>
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
      {notice && <p className="text-xs text-red-600 mb-2">{notice}</p>}
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

function draftsFromRows(rows: SalesJobRow[]): JobDraft[] {
  return rows.map((job) => ({
    key: job.id,
    jobType: job.jobType,
    clientId: job.jobType === 'prospect_new_outlet' ? '' : job.clientId,
    orderIds: job.orderIds?.length ? job.orderIds : job.orderId ? [job.orderId] : [],
    productIds: job.suggestedProducts ?? [],
    customerNumber: job.jobType === 'prospect_new_outlet' ? job.clientId : '',
    customerName: job.clientOwner || '',
    storeName: job.clientName,
    phone: job.clientPhone || '',
    address: job.clientAddress || '',
    reason: job.priorityReason || '',
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
    if (!assignedTo) setError(t('form.needRep'));
    else setError('');
    for (const job of jobs) {
      const times = job.schedules.map((row) => parseTime(row.time));
      const datesOk = job.schedules.every((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && parseTime(row.time));
      const unique = new Set(job.schedules.map((row) => `${row.date} ${row.time}`));
      if (!datesOk || unique.size !== job.schedules.length || times.some((row) => !row)) {
        next[job.key] = t('form.needSchedule');
        continue;
      }
      if (job.jobType === 'take_order' || job.jobType === 'collect_payment') {
        if (job.orderIds.length === 0) next[job.key] = t('form.needOrder');
      } else if (job.jobType === 'promote_product' || job.jobType === 'stock_check') {
        if (!job.clientId) next[job.key] = t('form.needClient');
        else if (job.productIds.length === 0) next[job.key] = t('form.needProduct');
      } else if (!job.customerNumber.trim() || !job.customerName.trim() || !job.storeName.trim() || !job.phone.trim() || !job.address.trim()) {
        next[job.key] = t('form.needOutlet');
      }
    }
    setJobErrors(next);
    return Boolean(assignedTo) && Object.keys(next).length === 0;
  };

  const save = async () => {
    if (!user?.id || saving) return;
    if (!validate()) return;
    setSaving(true);
    setError('');
    try {
      const jobsInput = jobs.map((job) => ({
            jobType: job.jobType,
            priorityReason: job.reason.trim() || null,
            clientId: job.clientId || null,
            orderIds: job.orderIds,
            productIds: job.productIds,
            prospect:
              job.jobType === 'prospect_new_outlet'
                ? {
                    customerNumber: job.customerNumber.trim(),
                    name: job.customerName.trim(),
                    storeName: job.storeName.trim(),
                    phone: job.phone.trim(),
                    address: job.address.trim(),
                  }
                : null,
            schedules: job.schedules.map((row) => {
              const time = parseTime(row.time)!;
              return { scheduledDate: row.date, reminderHour: time.reminderHour, reminderMinute: time.reminderMinute };
            }),
          }));
      await fetchGraphQL(
        editing
          ? `mutation UpdateSalesJobs($userId: Int!, $assignedTo: String!, $replaceIds: [String!]!, $jobs: [CreateSalesJobItemInput!]!) {
              updateSalesJobs(userId: $userId, assignedTo: $assignedTo, replaceIds: $replaceIds, jobs: $jobs) { id }
            }`
          : `mutation CreateSalesJobs($userId: Int!, $assignedTo: String!, $jobs: [CreateSalesJobItemInput!]!) {
              createSalesJobs(userId: $userId, assignedTo: $assignedTo, jobs: $jobs) { id }
            }`,
        {
          userId: user.id,
          assignedTo,
          jobs: jobsInput,
          ...(editing ? { replaceIds: editing.replaceIds } : {}),
        },
      );
      router.push('/sales/jobs');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed';
      setError(
        message.includes('already exists')
          ? t('form.customerExists')
          : message.includes('same client')
            ? t('form.sameClient')
            : message,
      );
    } finally {
      setSaving(false);
    }
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
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] transition text-sm disabled:opacity-50"
        >
          {saving ? t('form.saving') : editing ? t('form.saveChanges') : t('form.saveJobs')}
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

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

      {jobs.map((job, index) => (
        <section key={job.key} className="bg-white rounded-lg border border-[#e6e6e6]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e6e6e6]">
            <h2 className="text-sm font-semibold text-gray-900">{t('form.jobNumber', { number: index + 1 })}</h2>
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
          <div className="p-4 space-y-4">
            {jobErrors[job.key] && <p className="text-xs text-red-600">{jobErrors[job.key]}</p>}
            <div className="flex flex-wrap gap-2">
              {SALES_JOB_TYPES.map((jobType) => {
                const selected = job.jobType === jobType;
                return (
                  <button
                    key={jobType}
                    type="button"
                    onClick={() => updateJob(job.key, { jobType })}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                      selected ? 'bg-[#0a61d7] text-white border-[#0a61d7]' : 'bg-white text-gray-700 border-[#e6e6e6] hover:bg-gray-100'
                    }`}
                  >
                    {t(`types.${jobType}` as 'types.take_order')}
                  </button>
                );
              })}
            </div>

            {(job.jobType === 'take_order' || job.jobType === 'collect_payment') && user?.id && (
              <OrderPicker
                userId={user.id}
                purpose={job.jobType}
                selectedIds={job.orderIds}
                onChange={(orderIds) => updateJob(job.key, { orderIds })}
              />
            )}

            {(job.jobType === 'promote_product' || job.jobType === 'stock_check') && (
              <>
                <div>
                  <label className={labelClass}>
                    {t('client')} <span className="text-red-500">*</span>
                  </label>
                  <LakupakSelect
                    value={job.clientId}
                    placeholder={t('client')}
                    options={clients.map((client) => ({ value: client.buyerId, label: `${client.storeName} (${client.status})` }))}
                    onChange={(clientId) => updateJob(job.key, { clientId })}
                  />
                </div>
                <ProductPicker
                  products={products}
                  selectedIds={job.productIds}
                  hint={job.jobType === 'promote_product' ? t('form.productHintPromote') : t('form.productHintStock')}
                  onChange={(productIds) => updateJob(job.key, { productIds })}
                />
              </>
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
      ))}

      <button
        type="button"
        onClick={() => setJobs((prev) => [...prev, blankJob()])}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-[#e6e6e6] text-sm font-medium text-black hover:bg-gray-100"
      >
        <Plus className="w-4 h-4" />
        {t('form.addJob')}
      </button>
    </div>
  );
}
