'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { fetchGraphQL } from '@/lib/graphqlClient';
import { useUserStore } from '@/store/userStore';
import { Skeleton } from '@/components/ui/Skeleton';
import MapComponent from '@/components/ordershipment/MapComponent';
import { geocodeAddress, type MapCoordinates } from '@/utils/mapboxUtils';
import { PROSPECT_BUYER_TYPES } from '@/lib/salesJobs/prospectBuyerTypes';

const JAKARTA: MapCoordinates = { longitude: 106.8456, latitude: -6.2088 };
const labelClass = 'mb-2 block text-xs font-medium text-gray-700';
const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-black focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#0a61d7]';

function LakupakSelect({
  id,
  value,
  placeholder,
  options,
  onChange,
}: {
  id: string;
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
        id={id}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-xs text-black focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#0a61d7]"
      >
        <span className={selected ? 'text-black' : 'text-gray-500'}>{selected?.label || placeholder}</span>
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-[#e6e6e6] bg-white shadow-lg">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-100 ${
                value === option.value ? 'bg-gray-50 font-semibold text-[#0a61d7]' : 'text-gray-700'
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

type Prospect = {
  buyerId: string;
  customerNumber: string;
  owner: string;
  storeName: string;
  phone: string;
  address: string;
  region: string;
  buyerType: string;
  notes: string;
};

export default function ProspectForm({ buyerId }: { buyerId?: string }) {
  const editing = Boolean(buyerId);
  const t = useTranslations('dashboard.sales.prospects');
  const router = useRouter();
  const userId = useUserStore((state) => state.user?.id);
  const [customerNumber, setCustomerNumber] = useState('');
  const [name, setName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [region, setRegion] = useState('');
  const [buyerType, setBuyerType] = useState('');
  const [notes, setNotes] = useState('');
  const [pin, setPin] = useState<MapCoordinates | null>(null);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [addressSearchError, setAddressSearchError] = useState('');
  const geocodeRequest = useRef(0);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!editing || !userId || !buyerId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await fetchGraphQL<{ salesProspect: Prospect | null }>(
          `query SalesProspect($userId: Int!, $buyerId: String!) {
            salesProspect(userId: $userId, buyerId: $buyerId) {
              buyerId customerNumber owner storeName phone address region buyerType notes
            }
          }`,
          { userId, buyerId },
        );
        if (cancelled) return;
        const prospect = result.salesProspect;
        if (!prospect) {
          setError(t('missing'));
          return;
        }
        setCustomerNumber(prospect.customerNumber);
        setName(prospect.owner);
        setStoreName(prospect.storeName);
        setPhone(prospect.phone);
        setAddress(prospect.address);
        setRegion(prospect.region || '');
        setBuyerType(prospect.buyerType || '');
        setNotes(prospect.notes || '');
        if (prospect.address.trim()) {
          const found = await geocodeAddress(prospect.address);
          if (!cancelled && found.coordinates) setPin(found.coordinates);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editing, userId, buyerId, t]);

  const onMapClick = useCallback((coordinates: MapCoordinates) => {
    const requestId = geocodeRequest.current + 1;
    geocodeRequest.current = requestId;
    setPin(coordinates);
    setAddressSearchError('');
    setResolvingAddress(true);
    void (async () => {
      try {
        const response = await fetch('/api/mobile/geocode/reverse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude: coordinates.latitude, longitude: coordinates.longitude }),
        });
        const data = (await response.json()) as { address?: string };
        if (geocodeRequest.current !== requestId) return;
        if (typeof data.address === 'string' && data.address.trim()) setAddress(data.address);
      } catch {
        // The pin still marks the point that was chosen.
      } finally {
        if (geocodeRequest.current === requestId) setResolvingAddress(false);
      }
    })();
  }, []);

  const searchTypedAddress = useCallback(
    (rawAddress: string) => {
      const typed = rawAddress.trim();
      if (!typed) return;
      const regionText = region.trim();
      const query =
        regionText && !typed.toLowerCase().includes(regionText.toLowerCase()) ? `${typed}, ${regionText}` : typed;
      const requestId = geocodeRequest.current + 1;
      geocodeRequest.current = requestId;
      setResolvingAddress(true);
      setAddressSearchError('');
      void (async () => {
        try {
          const found = await geocodeAddress(query);
          if (geocodeRequest.current !== requestId) return;
          if (found.coordinates) setPin(found.coordinates);
          else setAddressSearchError(t('addressNotFound'));
        } catch {
          if (geocodeRequest.current === requestId) setAddressSearchError(t('addressNotFound'));
        } finally {
          if (geocodeRequest.current === requestId) setResolvingAddress(false);
        }
      })();
    },
    [region, t],
  );

  const save = async () => {
    if (!userId || saving || resolvingAddress) return;
    if (!customerNumber.trim() || !name.trim() || !storeName.trim() || !phone.trim() || !address.trim() || !buyerType) {
      setError(t('needFields'));
      return;
    }
    setSaving(true);
    setError('');
    const variables = {
      userId,
      customerNumber: customerNumber.trim(),
      name: name.trim(),
      storeName: storeName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      region: region.trim(),
      buyerType,
      notes: notes.trim(),
      ...(editing ? { buyerId } : {}),
    };
    try {
      await fetchGraphQL(
        editing
          ? `mutation UpdateProspect($userId: Int!, $buyerId: String!, $customerNumber: String!, $name: String!, $storeName: String!, $phone: String!, $address: String!, $region: String, $buyerType: String, $notes: String) {
              updateSalesProspect(userId: $userId, buyerId: $buyerId, customerNumber: $customerNumber, name: $name, storeName: $storeName, phone: $phone, address: $address, region: $region, buyerType: $buyerType, notes: $notes) { buyerId }
            }`
          : `mutation CreateProspect($userId: Int!, $customerNumber: String!, $name: String!, $storeName: String!, $phone: String!, $address: String!, $region: String, $buyerType: String, $notes: String) {
              createSalesProspect(userId: $userId, customerNumber: $customerNumber, name: $name, storeName: $storeName, phone: $phone, address: $address, region: $region, buyerType: $buyerType, notes: $notes) { buyerId }
            }`,
        variables,
      );
      router.push('/sales/prospects');
    } catch (err) {
      const message = err instanceof Error ? err.message : t('saveFailed');
      setError(message.includes('already exists') ? t('customerExists') : message.includes('Fill in') ? t('needFields') : message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4" aria-busy="true">
        <div className="rounded-lg border border-[#e6e6e6] bg-white p-4">
          <Skeleton className="mb-6 h-8 w-48" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-9 w-full rounded-lg sm:col-span-2" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="mx-auto w-full">
        {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</p>}
        <div className="rounded-lg border border-[#e6e6e6] bg-white">
          <div className="flex items-center justify-between gap-4 border-b border-[#e6e6e6] px-4 py-4">
            <div className="flex min-w-0 items-center gap-4">
              <Link
                href="/sales/prospects"
                className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-800"
              >
                <ArrowLeft className="h-4 w-4" />
                {t('back')}
              </Link>
              <h1 className="truncate text-2xl font-bold text-gray-900">{editing ? t('editTitle') : t('createTitle')}</h1>
            </div>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || resolvingAddress}
              className="rounded-lg bg-[#0a61d7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#084ba6] disabled:opacity-60"
            >
              {saving ? t('saving') : t('save')}
            </button>
          </div>
          <section className="p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="prospect-customer-number">
                  {t('customerNumber')} <span className="text-red-500">*</span>
                </label>
                <input id="prospect-customer-number" className={inputClass} maxLength={50} value={customerNumber} onChange={(event) => setCustomerNumber(event.target.value)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="prospect-name">
                  {t('retailer')} <span className="text-red-500">*</span>
                </label>
                <input id="prospect-name" className={inputClass} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="prospect-store">
                  {t('outlet')} <span className="text-red-500">*</span>
                </label>
                <input id="prospect-store" className={inputClass} maxLength={100} value={storeName} onChange={(event) => setStoreName(event.target.value)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="prospect-phone">
                  {t('phone')} <span className="text-red-500">*</span>
                </label>
                <input id="prospect-phone" className={inputClass} maxLength={20} value={phone} onChange={(event) => setPhone(event.target.value)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="prospect-region">{t('region')}</label>
                <input id="prospect-region" className={inputClass} maxLength={80} value={region} onChange={(event) => setRegion(event.target.value)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="prospect-buyer-type">
                  {t('buyerType')} <span className="text-red-500">*</span>
                </label>
                <LakupakSelect
                  id="prospect-buyer-type"
                  value={buyerType}
                  placeholder={t('buyerTypePlaceholder')}
                  options={PROSPECT_BUYER_TYPES.map((type) => ({ value: type, label: t(`buyerTypes.${type}`) }))}
                  onChange={setBuyerType}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="prospect-notes">{t('notes')}</label>
                <textarea
                  id="prospect-notes"
                  className={`${inputClass} min-h-20 resize-y`}
                  maxLength={500}
                  value={notes}
                  placeholder={t('notesPlaceholder')}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="prospect-address">
                  {t('address')} <span className="text-red-500">*</span>
                </label>
                <input
                  id="prospect-address"
                  className={inputClass}
                  maxLength={500}
                  value={address}
                  onChange={(event) => {
                    setAddress(event.target.value);
                    setAddressSearchError('');
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    searchTypedAddress(event.currentTarget.value);
                  }}
                />
                <p className="mt-2 text-xs text-gray-500">{t('mapHint')}</p>
                {addressSearchError && <p className="mt-1 text-xs text-red-600">{addressSearchError}</p>}
                <div className="mt-3 overflow-hidden rounded-lg border border-[#e6e6e6]">
                  <MapComponent
                    height="280px"
                    zoom={pin ? 15 : 11}
                    center={pin ?? JAKARTA}
                    markers={pin ? [{ id: 'prospect', coordinates: pin, color: '#0a61d7' }] : []}
                    onMapClick={onMapClick}
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
