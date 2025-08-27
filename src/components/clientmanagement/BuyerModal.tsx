'use client';
import React, { useState, useEffect } from 'react';
import { Trash, User, Upload, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import useSWR, { mutate as globalMutate } from 'swr';
import { useUserStore } from '@/store/userStore';
import { Buyer, BuyerFormData, OrderDetail } from '@/types/client';

const statusOptions = ["Active", "Inactive", "Blocked"];

function generateBuyerId() {
  return 'LKB-' + Math.floor(10000000 + Math.random() * 90000000).toString();
}

export default function BuyerModal({ open, onClose, onSave, initialData, mode }: {
  open: boolean;
  onClose: () => void;
  onSave: (data: BuyerFormData) => void;
  initialData?: Buyer;
  mode?: 'edit';
}) {
  const router = useRouter();
  const user = useUserStore(state => state.user);
  
  // Helper function to safely parse JSON strings
  const safeParseJSON = (jsonStr: string, fallback: unknown) => {
    if (!jsonStr) return fallback;
    try {
      return JSON.parse(jsonStr);
    } catch {
      return fallback;
    }
  };
  
  const [form, setForm] = useState(() => {
    if (!initialData) {
      return {
        storeName: '', owner: '', phone: '', email: '', address: '', businessType: '', 
        status: statusOptions[0], createdAt: new Date().toISOString().split('T')[0], preferredDays: '', lastShipment: '', 
        shipmentSuccess: '', notes: '',
      };
    }
    
    // Parse JSON strings from database
    const parsedNotes = safeParseJSON(initialData.notes || '', []);
    const parsedLogistics = safeParseJSON(initialData.logistics || '', {});
    
    return {
      storeName: initialData.storeName || '',
      owner: initialData.owner || '',
      phone: initialData.phone || '',
      email: initialData.email || '',
      address: initialData.address || '',
      businessType: initialData.businessType || '',
      status: initialData.status || statusOptions[0],
      createdAt: initialData.createdAt ? new Date(initialData.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      preferredDays: parsedLogistics.preferredDays || '',
      lastShipment: parsedLogistics.lastShipment || '',
      shipmentSuccess: parsedLogistics.shipmentSuccess || '',
      notes: Array.isArray(parsedNotes) ? parsedNotes.join(', ') : '',
    };
  });
  
  const [id, setId] = useState(() => initialData?.id || generateBuyerId());
  const [orderRows, setOrderRows] = useState<OrderDetail[]>(
    initialData?.orderDetails ? (() => {
      try {
        const parsed = JSON.parse(initialData.orderDetails);
        return Array.isArray(parsed) ? parsed.map((row: OrderDetail) => ({
          orderNo: row.orderNo || '',
          product: row.product || '',
          totalOrders: row.totalOrders || '',
          totalSpend: row.totalSpend || '',
          lastOrderDate: row.lastOrderDate || '',
          outstanding: row.outstanding || '',
        })) : [{ orderNo: '', product: '', totalOrders: '', totalSpend: '', lastOrderDate: '', outstanding: '' }];
      } catch {
        return [{ orderNo: '', product: '', totalOrders: '', totalSpend: '', lastOrderDate: '', outstanding: '' }];
      }
    })() : [{ orderNo: '', product: '', totalOrders: '', totalSpend: '', lastOrderDate: '', outstanding: '' }]
  );

  // Function to get the latest order date
  const getLatestOrderDate = (rows: OrderDetail[]) => {
    if (!rows || rows.length === 0) return '';
    const dates = rows
      .map(row => row.lastOrderDate)
      .filter(date => date && date.trim() !== '')
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    return dates.length > 0 ? dates[0] : '';
  };

  // Update lastShipment when orderRows change
  React.useEffect(() => {
    const latestDate = getLatestOrderDate(orderRows);
    if (latestDate && latestDate !== form.lastShipment) {
      setForm(prev => ({ ...prev, lastShipment: latestDate }));
    }
  }, [orderRows, form.lastShipment]);
  const handleOrderChange = (idx: number, field: keyof OrderDetail, value: string) => {
    setOrderRows((rows: OrderDetail[]) => rows.map((row: OrderDetail, i: number) => i === idx ? { ...row, [field]: value } : row));
  };
  const addOrderRow = () => setOrderRows((rows: OrderDetail[]) => [...rows, { orderNo: '', product: '', totalOrders: '', totalSpend: '', lastOrderDate: '', outstanding: '' }]);
  const deleteOrderRow = (idx: number) => setOrderRows((rows: OrderDetail[]) => rows.filter((_: OrderDetail, i: number) => i !== idx));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [redirecting, setRedirecting] = useState(false);
  const [avatar, setAvatar] = useState(initialData?.avatar || '');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && mode === 'edit' && initialData) {
      // Parse JSON strings from database
      const parsedNotes = safeParseJSON(initialData.notes || '', []);
      const parsedLogistics = safeParseJSON(initialData.logistics || '', {});
      
      // Get order details first to calculate latest date
      const orderDetails = initialData?.orderDetails ? (() => {
        try {
          const parsed = JSON.parse(initialData.orderDetails);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })() : [];
      
      const latestOrderDate = getLatestOrderDate(orderDetails);
      
      setForm({
        storeName: initialData.storeName || '',
        owner: initialData.owner || '',
        phone: initialData.phone || '',
        email: initialData.email || '',
        address: initialData.address || '',
        businessType: initialData.businessType || '',
        status: initialData.status || statusOptions[0],
        createdAt: initialData.createdAt ? new Date(initialData.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        preferredDays: parsedLogistics.preferredDays || '',
        lastShipment: latestOrderDate || parsedLogistics.lastShipment || '',
        shipmentSuccess: parsedLogistics.shipmentSuccess || '',
        notes: Array.isArray(parsedNotes) ? parsedNotes.join(', ') : '',
      });
      setId(initialData.buyerId || generateBuyerId());
      setOrderRows(
        orderDetails.length > 0 ? orderDetails.map((row: OrderDetail) => ({
          orderNo: row.orderNo || '',
          product: row.product || '',
          totalOrders: row.totalOrders || '',
          totalSpend: row.totalSpend || '',
          lastOrderDate: row.lastOrderDate || '',
          outstanding: row.outstanding || '',
        })) : [{ orderNo: '', product: '', totalOrders: '', totalSpend: '', lastOrderDate: '', outstanding: '' }]
      );
      setAvatar(initialData.avatar || '');
    }
  }, [open, mode, initialData]);

  if (!open) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const isEdit = mode === 'edit';
      const payload = {
        ...form,
        avatar,
        buyerId: id,
        orderDetails: JSON.stringify(orderRows),
        notes: JSON.stringify(form.notes.split(',').map((n: string) => n.trim())),
        createdAt: isEdit ? (form.createdAt ? new Date(form.createdAt).toISOString() : new Date().toISOString()) : new Date().toISOString(),
        logistics: JSON.stringify({
          preferredDays: form.preferredDays || '',
          lastShipment: form.lastShipment || '',
          shipmentSuccess: form.shipmentSuccess || ''
        }),
        userId: user?.id,
      };
      if (isEdit && initialData && typeof initialData.id === 'number') {
        (payload as any).id = initialData.id;
      }
      delete payload.preferredDays;
      delete payload.lastShipment;
      delete payload.shipmentSuccess;
      
      // Debug: Log the payload being sent
      console.log('Buyer payload being sent:', payload);
      
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch('/api/buyers', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save');
      }
      
      const savedBuyer = await res.json();
      onSave(savedBuyer);
      
      if (isEdit) {
        const routeId = savedBuyer.buyerId || payload.buyerId;
        // Close modal first
        onClose();
        // Redirect to profile page
        router.push(`/clients/buyers/details/${routeId}`);
        // Force page reload to show updated data
        setTimeout(() => window.location.reload(), 100);
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
      <div className="bg-white rounded-2xl shadow-xl p-4 w-full max-w-4xl relative">
        <button
          type="button"
          className="absolute top-3 right-3 p-2 rounded-full hover:bg-gray-200 text-gray-500"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-black mb-4 border-b border-gray-200 pb-2">{mode === 'edit' ? 'Edit Buyer' : 'Add Buyer'}</h2>
        <form className="flex flex-col gap-2 overflow-y-auto max-h-[70vh] hide-scrollbar">
          <div className="flex flex-col items-left mb-4">
            <div className="flex items-center gap-3">
              <div className="w-18 h-18 rounded-full bg-gray-100 border flex items-center justify-center overflow-hidden mb-2">
                {avatar ? (
                  <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-10 h-10 text-gray-400" />
                )}
              </div>
              <button
                type="button"
                className="ml-2 px-3 py-2 rounded-lg bg-[#0a61d7] text-white text-xs font-semibold hover:bg-[#084ba6] flex items-center gap-1"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-4 h-4" /> Upload Photo
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = ev => setAvatar(ev.target?.result as string);
                    reader.readAsDataURL(file);
                  }
                }}
              />
            </div>
          </div>
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
                    <th className="py-2 px-3 font-medium uppercase">No.</th>
                    <th className="py-2 px-3 font-medium uppercase">Product</th>
                    <th className="py-2 px-3 font-medium uppercase">Total Orders (Boxes)</th>
                    <th className="py-2 px-3 font-medium uppercase">Total Spend</th>
                    <th className="py-2 px-3 font-medium uppercase">Last Order Date</th>
                    <th className="py-2 px-3 font-medium uppercase">Outstanding</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {orderRows.map((row: OrderDetail, idx: number) => (
                    <tr key={idx} className="whitespace-nowrap">
                      <td className="py-2 px-3 font-medium text-black">{idx + 1}</td>
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
              <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                Created At 
                <span className="text-xs text-gray-400">(auto-generated)</span>
                <div className="w-3 h-3 bg-gray-200 rounded-full flex items-center justify-center text-[8px] text-gray-500">i</div>
              </label>
              <input type="date" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2 disabled:bg-gray-100 cursor-not-allowed" value={form.createdAt} onChange={e => setForm(f => ({ ...f, createdAt: e.target.value }))} required disabled />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Preferred Delivery Days</label>
              <input type="text" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2" value={form.preferredDays} onChange={e => setForm(f => ({ ...f, preferredDays: e.target.value }))} placeholder="e.g. Mon, Wed, Fri" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                Last Shipment Date 
                <span className="text-xs text-gray-400">(auto from orders)</span>
                <div className="w-3 h-3 bg-gray-200 rounded-full flex items-center justify-center text-[8px] text-gray-500">i</div>
              </label>
              <input type="date" className="text-black text-xs w-full border border-gray-200 rounded-lg px-3 py-2 disabled:bg-gray-100 cursor-not-allowed" value={form.lastShipment} onChange={e => setForm(f => ({ ...f, lastShipment: e.target.value }))} disabled />
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
