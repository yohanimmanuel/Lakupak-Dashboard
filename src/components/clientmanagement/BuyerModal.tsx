'use client';
import React, { useState, useEffect } from 'react';
import { Trash } from 'lucide-react';
import { useRouter } from 'next/navigation';
import useSWR, { mutate as globalMutate } from 'swr';

const statusOptions = ["Active", "Inactive", "Blocked"];

function generateBuyerId() {
  return 'LKB-' + Math.floor(10000000 + Math.random() * 90000000).toString();
}

export default function BuyerModal({ open, onClose, onSave, initialData, mode }: {
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  initialData?: any;
  mode?: 'add' | 'edit';
}) {
  const router = useRouter();
  const [form, setForm] = useState(() => initialData ? {
    storeName: initialData.storeName || '',
    owner: initialData.owner || '',
    phone: initialData.phone || '',
    email: initialData.email || '',
    address: initialData.address || '',
    businessType: initialData.businessType || '',
    status: initialData.status || statusOptions[0],
    createdAt: initialData.createdAt || '',
    preferredDays: initialData.logistics?.preferredDays || '',
    lastShipment: initialData.logistics?.lastShipment || '',
    shipmentSuccess: initialData.logistics?.shipmentSuccess || '',
    notes: initialData.notes ? initialData.notes.join(', ') : '',
  } : {
    storeName: '', owner: '', phone: '', email: '', address: '', businessType: '', status: statusOptions[0], createdAt: '', preferredDays: '', lastShipment: '', shipmentSuccess: '', notes: '',
  });
  const [id, setId] = useState(() => initialData?.id || generateBuyerId());
  const [orderRows, setOrderRows] = useState<Array<{ orderNo: string; product: string; totalOrders: string | number; totalSpend: string; lastOrderDate: string; outstanding: string }>>(
    initialData?.orderDetails?.length ? initialData.orderDetails.map((row: any) => ({
      orderNo: row.orderNo || '',
      product: row.product || '',
      totalOrders: row.totalOrders || '',
      totalSpend: row.totalSpend || '',
      lastOrderDate: row.lastOrderDate || '',
      outstanding: row.outstanding || '',
    })) : [{ orderNo: '', product: '', totalOrders: '', totalSpend: '', lastOrderDate: '', outstanding: '' }]
  );
  const handleOrderChange = (idx: number, field: string, value: string) => {
    setOrderRows((rows: Array<any>) => rows.map((row: any, i: number) => i === idx ? { ...row, [field]: value } : row));
  };
  const addOrderRow = () => setOrderRows((rows: Array<any>) => [...rows, { orderNo: '', product: '', totalOrders: '', totalSpend: '', lastOrderDate: '', outstanding: '' }]);
  const deleteOrderRow = (idx: number) => setOrderRows((rows: Array<any>) => rows.filter((_: any, i: number) => i !== idx));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (open && mode === 'edit' && initialData) {
      setForm({
        storeName: initialData.storeName || '',
        owner: initialData.owner || '',
        phone: initialData.phone || '',
        email: initialData.email || '',
        address: initialData.address || '',
        businessType: initialData.businessType || '',
        status: initialData.status || statusOptions[0],
        createdAt: initialData.createdAt || '',
        preferredDays: initialData.logistics?.preferredDays || '',
        lastShipment: initialData.logistics?.lastShipment || '',
        shipmentSuccess: initialData.logistics?.shipmentSuccess || '',
        notes: initialData.notes ? initialData.notes.join(', ') : '',
      });
      setId(initialData.id || generateBuyerId());
      setOrderRows(
        initialData?.orderDetails?.length
          ? initialData.orderDetails.map((row: any) => ({
              orderNo: row.orderNo || '',
              product: row.product || '',
              totalOrders: row.totalOrders || '',
              totalSpend: row.totalSpend || '',
              lastOrderDate: row.lastOrderDate || '',
              outstanding: row.outstanding || '',
            }))
          : [{ orderNo: '', product: '', totalOrders: '', totalSpend: '', lastOrderDate: '', outstanding: '' }]
      );
    }
  }, [open, mode, initialData]);

  if (!open) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const isEdit = mode === 'edit';
      const payload: any = {
        ...form,
        buyerId: id,
        orderDetails: orderRows,
        notes: form.notes.split(',').map((n: string) => n.trim()),
        createdAt: form.createdAt ? new Date(form.createdAt).toISOString() : new Date().toISOString(),
        logistics: {
          preferredDays: form.preferredDays,
          lastShipment: form.lastShipment ? new Date(form.lastShipment).toISOString() : undefined,
          shipmentSuccess: form.shipmentSuccess
        }
      };
      if (isEdit && initialData && typeof initialData.id === 'number') {
        payload.id = initialData.id;
      }
      delete payload.preferredDays;
      delete payload.lastShipment;
      delete payload.shipmentSuccess;
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch('/api/buyers', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to save');
      onSave(payload);
      if (isEdit) {
        await globalMutate(`/api/buyers?id=${payload.buyerId}`);
        setTimeout(() => {
          router.push(`/clients/buyers/details/${payload.buyerId}`);
        }, 500);
      } else {
        onClose();
      }
    } catch (err) {
      setError('Failed to save buyer');
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
        <h2 className="text-xl font-bold text-black mb-4 border-b border-gray-200 pb-2">{mode === 'edit' ? 'Edit Buyer' : 'Add Buyer'}</h2>
        <form className="flex flex-col gap-2 overflow-y-auto max-h-[70vh] hide-scrollbar">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">ID</label>
            <input type="text" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2 disabled:bg-gray-100" value={id} onChange={e => setId(e.target.value)} required disabled />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Store Name</label>
                <input type="text" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.storeName} onChange={e => setForm(f => ({ ...f, storeName: e.target.value }))} required />
            </div>
            <div className="flex-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Owner Name</label>
                <input type="text" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} required />
            </div>
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
              <input type="text" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.businessType} onChange={e => setForm(f => ({ ...f, businessType: e.target.value }))} required />
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
          {/* Order & Product Details Table */}
          <div className="my-2 border-t border-gray-200 pt-2">
            <label className="block text-sm font-bold text-black mb-2">Order & Product Details</label>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-xs font-medium text-left bg-white">
                <thead>
                  <tr className="text-gray-500 bg-gray-100 whitespace-nowrap">
                    <th className="py-2 px-3 font-medium uppercase">Order No</th>
                    <th className="py-2 px-3 font-medium uppercase">Product</th>
                    <th className="py-2 px-3 font-medium uppercase">Total Orders (Boxes)</th>
                    <th className="py-2 px-3 font-medium uppercase">Total Spend</th>
                    <th className="py-2 px-3 font-medium uppercase">Last Order Date</th>
                    <th className="py-2 px-3 font-medium uppercase">Outstanding</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {orderRows.map((row: any, idx: number) => (
                    <tr key={idx} className="whitespace-nowrap">
                      <td className="py-2 px-3"><input type="text" className="w-full text-black border border-gray-200 rounded px-1 py-1" value={row.orderNo} onChange={e => handleOrderChange(idx, 'orderNo', e.target.value)} /></td>
                      <td className="py-2 px-3"><input type="text" className="w-full text-black border border-gray-200 rounded px-1 py-1" value={row.product} onChange={e => handleOrderChange(idx, 'product', e.target.value)} /></td>
                      <td className="py-2 px-3"><input type="number" className="w-full text-black border border-gray-200 rounded px-1 py-1" value={row.totalOrders} onChange={e => handleOrderChange(idx, 'totalOrders', e.target.value)} /></td>
                      <td className="py-2 px-3"><input type="text" className="w-full text-black border border-gray-200 rounded px-1 py-1" value={row.totalSpend} onChange={e => handleOrderChange(idx, 'totalSpend', e.target.value)} /></td>
                      <td className="py-2 px-3"><input type="date" className="w-full text-black border border-gray-200 rounded px-1 py-1" value={row.lastOrderDate} onChange={e => handleOrderChange(idx, 'lastOrderDate', e.target.value)} /></td>
                      <td className="py-2 px-3"><input type="text" className="w-full text-black border border-gray-200 rounded px-1 py-1" value={row.outstanding} onChange={e => handleOrderChange(idx, 'outstanding', e.target.value)} /></td>
                      <td className="py-2 px-3">
                        <button type="button" className="text-red-500 font-bold p-1 hover:bg-red-100 rounded-full" onClick={() => deleteOrderRow(idx)} disabled={orderRows.length === 1}><Trash className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className="mt-2 px-3 py-1 rounded-lg bg-[#0a61d7] text-white text-xs font-semibold hover:bg-[#084ba6]" onClick={addOrderRow}>+ Add Row</button>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Created At</label>
              <input type="date" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.createdAt} onChange={e => setForm(f => ({ ...f, createdAt: e.target.value }))} required />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Preferred Delivery Days</label>
              <input type="text" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.preferredDays} onChange={e => setForm(f => ({ ...f, preferredDays: e.target.value }))} placeholder="e.g. Mon, Wed, Fri" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Last Shipment Date</label>
              <input type="date" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.lastShipment} onChange={e => setForm(f => ({ ...f, lastShipment: e.target.value }))} />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Shipment Success Rate (%)</label>
              <input type="number" min="0" max="100" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.shipmentSuccess} onChange={e => setForm(f => ({ ...f, shipmentSuccess: e.target.value }))} placeholder="e.g. 98" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes/Tags <span className="text-xs text-gray-400">(comma separated)</span></label>
            <input type="text" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Good payer, Often requests promo items" />
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
