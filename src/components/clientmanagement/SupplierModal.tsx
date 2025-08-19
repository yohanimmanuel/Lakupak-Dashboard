'use client';
import React, { useState } from 'react';
import { Trash } from 'lucide-react';
import { useRouter } from 'next/navigation';
import useSWR, { mutate as globalMutate } from 'swr';
import { useUserStore } from '@/store/userStore';

const categories = ["Instant Noodles", "Mineral Water", "Rice", "Bread"];
const statusOptions = ["Active", "Inactive", "Blocked"];

function generateSupplierId() {
  return 'LKS-' + Math.floor(10000000 + Math.random() * 90000000).toString();
}

export default function SupplierModal({ open, onClose, onSave, initialData, mode }: {
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  initialData?: any;
  mode?: 'add' | 'edit';
}) {
  const router = useRouter();
  const user = useUserStore(state => state.user);
  const [form, setForm] = useState(() => initialData ? {
    supplierName: initialData.name || initialData.supplierName || '',
    contact: initialData.contact || '',
    phone: initialData.phone || '',
    email: initialData.email || '',
    businessType: initialData.businessType || '',
    address: initialData.address || '',
    status: initialData.status || statusOptions[0],
    createdAt: initialData.createdAt || '',
    preferredDays: initialData.logistics?.preferredDays || '',
    lastDelivery: initialData.logistics?.lastDelivery || '',
    deliverySuccess: initialData.logistics?.deliverySuccess || '',
    notes: initialData.notes ? initialData.notes.join(', ') : '',
  } : {
    supplierName: '', contact: '', phone: '', email: '', businessType: '', address: '', status: statusOptions[0], createdAt: '', preferredDays: '', lastDelivery: '', deliverySuccess: '', notes: '',
  });
  const [id, setId] = useState(() => initialData?.id || generateSupplierId());
  const [supplyRows, setSupplyRows] = useState<Array<{ sku: string; product: string; totalSupplied: string | number; totalValue: string; lastDelivery: string; status: string }>>(
    initialData?.supplies?.length ? initialData.supplies.map((row: any) => ({
      suppliesno: row.suppliesno || '',
      sku: row.sku || '',
      product: row.product || '',
      totalSupplied: row.totalSupplied || '',
      totalValue: row.totalValue || '',
      lastDelivery: row.lastDelivery || '',
    })) : [{ suppliesno: '', sku: '', product: '', totalSupplied: '', totalValue: '', lastDelivery: '', status: statusOptions[0] }]
  );
  const handleSupplyChange = (idx: number, field: string, value: string) => {
    setSupplyRows((rows: Array<any>) => rows.map((row: any, i: number) => i === idx ? { ...row, [field]: value } : row));
  };
  const addSupplyRow = () => setSupplyRows((rows: Array<any>) => [...rows, { suppliesno: '', sku: '', product: '', totalSupplied: '', totalValue: '', lastDelivery: '', status: statusOptions[0] }]);
  const deleteSupplyRow = (idx: number) => setSupplyRows((rows: Array<any>) => rows.filter((_: any, i: number) => i !== idx));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [redirecting, setRedirecting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const isEdit = mode === 'edit';
      const payload: any = {
        ...form,
        supplierId: id,
        name: form.supplierName,
        supplies: supplyRows,
        notes: form.notes.split(',').map((n: string) => n.trim()),
        createdAt: form.createdAt ? new Date(form.createdAt).toISOString() : new Date().toISOString(),
        logistics: {
          preferredDays: form.preferredDays,
          lastDelivery: form.lastDelivery ? new Date(form.lastDelivery).toISOString() : undefined,
          deliverySuccess: form.deliverySuccess
        },
        userId: user?.id,
      };
      if (isEdit && initialData && typeof initialData.id === 'number') {
        payload.id = initialData.id;
      }
      delete payload.supplierName;
      delete payload.preferredDays;
      delete payload.lastDelivery;
      delete payload.deliverySuccess;
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch('/api/suppliers', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to save');
      onSave(payload);
      if (isEdit) {
        await globalMutate(`/api/suppliers?id=${payload.supplierId}`);
        router.push(`/clients/suppliers/details/${payload.supplierId}`);
      } else {
        onClose();
      }
    } catch (err) {
      setError('Failed to save supplier');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      {/* Loading overlay */}
      {(saving || redirecting) && (
        <div className="absolute inset-0 bg-white bg-opacity-70 flex items-center justify-center z-50">
          <span className="loader mr-2"></span>
          <span className="text-black font-semibold text-lg">Saving...</span>
        </div>
      )}
      <div className="bg-white rounded-2xl shadow-xl p-4 w-full max-w-4xl relative">
        <h2 className="text-xl font-bold text-black mb-4 border-b border-gray-200 pb-2">{mode === 'edit' ? 'Edit Supplier' : 'Add Supplier'}</h2>
        <form className="flex flex-col gap-2 overflow-y-auto max-h-[70vh] hide-scrollbar">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">ID</label>
            <input type="text" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2 disabled:bg-gray-100" value={id} onChange={e => setId(e.target.value)} required disabled />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Supplier Name</label>
            <input type="text" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.supplierName} onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Contact Person</label>
            <input type="text" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} required />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
              <input type="text" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
              <input type="email" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Business Type</label>
              <input type="text" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.businessType} onChange={e => setForm(f => ({ ...f, businessType: e.target.value }))} placeholder="e.g. Manufacturer, Importer, Distributor, Trader...." />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {statusOptions.map(status => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Address</label>
            <textarea className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} required />
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
                  {supplyRows.map((row: any, idx: number) => (
                    <tr key={idx} className="whitespace-nowrap">
                      <td className="py-2 px-3 font-medium text-black">{idx + 1}</td>
                      <td className="py-2 px-3"><input type="text" className="w-full text-black border border-gray-200 rounded px-1 py-1" value={row.sku} onChange={e => handleSupplyChange(idx, 'sku', e.target.value)} /></td>
                      <td className="py-2 px-3"><input type="text" className="w-full text-black border border-gray-200 rounded px-1 py-1" value={row.product} onChange={e => handleSupplyChange(idx, 'product', e.target.value)} /></td>
                      <td className="py-2 px-3"><input type="number" className="w-full text-black border border-gray-200 rounded px-1 py-1" value={row.totalSupplied} onChange={e => handleSupplyChange(idx, 'totalSupplied', e.target.value)} /></td>
                      <td className="py-2 px-3"><input type="text" className="w-full text-black border border-gray-200 rounded px-1 py-1" value={row.totalValue} onChange={e => handleSupplyChange(idx, 'totalValue', e.target.value)} /></td>
                      <td className="py-2 px-3"><input type="date" className="w-full text-black border border-gray-200 rounded px-1 py-1" value={row.lastDelivery} onChange={e => handleSupplyChange(idx, 'lastDelivery', e.target.value)} /></td>
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
              <label className="block text-xs font-medium text-gray-700 mb-1">Created At</label>
              <input type="date" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.createdAt} onChange={e => setForm(f => ({ ...f, createdAt: e.target.value }))} required />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Preferred Delivery Days</label>
              <input type="text" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.preferredDays} onChange={e => setForm(f => ({ ...f, preferredDays: e.target.value }))} placeholder="e.g. Tue, Thu" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Last Delivery Date</label>
              <input type="date" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.lastDelivery} onChange={e => setForm(f => ({ ...f, lastDelivery: e.target.value }))} />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Delivery Success Rate (%)</label>
              <input type="number" min="0" max="100" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.deliverySuccess} onChange={e => setForm(f => ({ ...f, deliverySuccess: e.target.value }))} placeholder="e.g. 97" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes/Tags <span className="text-xs text-gray-400">(comma separated)</span></label>
            <input type="text" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Reliable partner, Quick response" />
          </div>
          {error && <div className="text-red-500 text-xs mb-2">{error}</div>}
        </form>
        <div className="flex justify-end gap-2 mt-4 text-sm border-t border-gray-200 pt-4">
            <button type="button" className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="button" className="px-4 py-2 rounded-lg bg-[#0a61d7] text-white font-semibold hover:bg-[#084ba6] flex items-center justify-center" onClick={handleSubmit} disabled={saving}>
              {saving ? <span className="loader mr-2"></span> : null}Save
            </button>
        </div>
      </div>
    </div>
  );
}
