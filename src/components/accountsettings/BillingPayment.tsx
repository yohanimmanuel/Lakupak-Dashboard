'use client';

import React, { useState, useEffect } from 'react';
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
  DollarSign,
  FileText,
  Clock,
  Shield
} from 'lucide-react';

interface PaymentMethod {
  id: string;
  type: 'card' | 'bank' | 'ewallet';
  name: string;
  last4?: string;
  expiry?: string;
  isDefault: boolean;
  status: 'active' | 'expired' | 'pending';
}

interface BillingAddress {
  companyName: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  email: string;
}

interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: 'paid' | 'pending' | 'overdue';
  dueDate: string;
  description: string;
}

export default function BillingPayment() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Payment methods state
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([
    {
      id: '1',
      type: 'card',
      name: 'Visa **** 1234',
      last4: '1234',
      expiry: '12/25',
      isDefault: true,
      status: 'active'
    },
    {
      id: '2',
      type: 'bank',
      name: 'Bank Transfer - BCA',
      isDefault: false,
      status: 'active'
    }
  ]);

  // Billing address state
  const [billingAddress, setBillingAddress] = useState<BillingAddress>({
    companyName: 'PT Laku Indonesia',
    address: 'Jl. Sudirman No. 123',
    city: 'Jakarta',
    state: 'DKI Jakarta',
    postalCode: '12190',
    country: 'Indonesia',
    phone: '+62 21 1234 5678',
    email: 'billing@laku.com'
  });

  // Invoices state
  const [invoices, setInvoices] = useState<Invoice[]>([
    {
      id: 'INV-2024-001',
      date: '2024-01-15',
      amount: 1500000,
      status: 'paid',
      dueDate: '2024-02-15',
      description: 'Monthly Subscription - Pro Plan'
    },
    {
      id: 'INV-2024-002',
      date: '2024-02-15',
      amount: 1500000,
      status: 'pending',
      dueDate: '2024-03-15',
      description: 'Monthly Subscription - Pro Plan'
    }
  ]);

  // Modal states
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [showEditAddressModal, setShowEditAddressModal] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);


  // Auto-dismiss success messages
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const handleAddPaymentMethod = () => {
    setShowAddPaymentModal(true);
  };

  const handleEditPaymentMethod = (id: string) => {
    setEditingPaymentId(id);
    setShowAddPaymentModal(true);
  };

  const handleDeletePaymentMethod = (id: string) => {
    setPaymentMethods(prev => prev.filter(pm => pm.id !== id));
    setSuccess('Payment method deleted successfully');
  };

  const handleSetDefaultPayment = (id: string) => {
    setPaymentMethods(prev => 
      prev.map(pm => ({
        ...pm,
        isDefault: pm.id === id
      }))
    );
    setSuccess('Default payment method updated');
  };

  const handleEditBillingAddress = () => {
    setShowEditAddressModal(true);
  };

  const handleSaveBillingAddress = (e: React.FormEvent) => {
    e.preventDefault();
    // Here you would typically save to database
    // For now, just close the modal
    setShowEditAddressModal(false);
    setSuccess('Billing address updated successfully');
  };

  const handleDownloadInvoice = (invoiceId: string) => {
    setSuccess(`Invoice ${invoiceId} downloaded successfully`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'text-green-600 bg-green-50';
      case 'pending':
        return 'text-yellow-600 bg-yellow-50';
      case 'overdue':
        return 'text-red-600 bg-red-50';
      case 'active':
        return 'text-green-600 bg-green-50';
      case 'expired':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getPaymentIcon = (type: string) => {
    switch (type) {
      case 'card':
        return <CreditCard className="h-4 w-4" />;
      case 'bank':
        return <Building2 className="h-4 w-4" />;
      case 'ewallet':
        return <Wallet className="h-4 w-4" />;
      default:
        return <CreditCard className="h-4 w-4" />;
    }
  };

  return (
    <div className="p-4">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-black mb-2">Billing & Payment</h2>
        <p className="text-sm text-gray-600">Manage your payment methods, billing information, and invoices</p>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center">
            <Check className="h-4 w-4 text-green-600 mr-2" />
            <span className="text-sm text-green-800">{success}</span>
          </div>
          <button
            onClick={() => setSuccess(null)}
            className="text-green-600 hover:text-green-800"
          >
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

       <div className="space-y-4">

        {/* Subscription & Payment Methods Section */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
           <div className="flex items-center justify-between mb-6">
             <div>
               <h3 className="text-md font-semibold text-black mb-1">Subscription & Payment</h3>
               <p className="text-xs text-gray-600">Manage your subscription plan and payment methods</p>
             </div>
             <div className="flex items-center gap-2">
               <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors">
                 <Shield className="h-4 w-4" />
                 Upgrade Plan
               </button>
               <button
                 onClick={handleAddPaymentMethod}
                 className="flex items-center gap-2 px-4 py-2 bg-[#0a61d7] text-white text-sm font-medium rounded-lg hover:bg-[#0a52c0] transition-colors"
               >
                 <Plus className="h-4 w-4" />
                 Add Payment Method
               </button>
             </div>
           </div>

           {/* Current Plan Info */}
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
             <div className="p-4 border border-gray-200 rounded-lg">
               <div className="flex items-center justify-between mb-2">
                 <h4 className="text-smfont-medium text-black">Current Plan</h4>
                 <span className="px-2 py-1 text-xs font-medium text-green-600 bg-green-50 rounded-lg">
                   Active
                 </span>
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
               <p className="text-sm font-medium text-black mb-1">Visa **** 1234</p>
               <p className="text-xs text-gray-600">Expires 12/25</p>
             </div>
           </div>

           {/* Payment Methods List */}
           <div>
             <h4 className="text-sm font-medium text-black mb-4">Payment Methods</h4>
             <div className="space-y-3">
               {paymentMethods.map((method) => (
                 <div
                   key={method.id}
                   className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                 >
                   <div className="flex items-center space-x-3">
                     <div className="p-2 bg-gray-100 rounded-lg">
                       {getPaymentIcon(method.type)}
                     </div>
                     <div>
                       <div className="flex items-center space-x-2">
                         <span className="text-sm font-medium text-black">{method.name}</span>
                         {method.isDefault && (
                           <span className="px-2 py-1 text-xs font-medium text-[#0a61d7] bg-blue-50 rounded">
                             Default
                           </span>
                         )}
                       </div>
                       {method.last4 && (
                         <p className="text-xs text-gray-600">Expires {method.expiry}</p>
                       )}
                     </div>
                   </div>
                   <div className="flex items-center space-x-2">
                     <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(method.status)}`}>
                       {method.status}
                     </span>
                     {!method.isDefault && (
                       <button
                         onClick={() => handleSetDefaultPayment(method.id)}
                         className="p-1 text-gray-400 hover:text-[#0a61d7] transition-colors"
                         title="Set as default"
                       >
                         <Check className="h-4 w-4" />
                       </button>
                     )}
                     <button
                       onClick={() => handleEditPaymentMethod(method.id)}
                       className="p-1 text-gray-400 hover:text-[#0a61d7] transition-colors"
                       title="Edit"
                     >
                       <Edit className="h-4 w-4" />
                     </button>
                     <button
                       onClick={() => handleDeletePaymentMethod(method.id)}
                       className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                       title="Delete"
                     >
                       <Trash2 className="h-4 w-4" />
                     </button>
                   </div>
                 </div>
               ))}
             </div>
           </div>
        </div>

        {/* Invoices Section */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
            <div>
            <h3 className="text-md font-semibold text-black mb-1">Invoices & Billing History</h3>
            <p className="text-xs text-gray-600">View and download your invoices and payment history</p>
            </div>
            <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
            <Download className="h-4 w-4" />
            Download All
            </button>
        </div>

        <div className="space-y-3">
            {invoices.map((invoice) => (
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
                    <span className="text-sm font-medium text-black">{invoice.id}</span>
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
                        Due: {new Date(invoice.dueDate).toLocaleDateString()}
                    </span>
                    </div>
                </div>
                </div>
                <div className="flex items-center space-x-3">
                <div className="text-right text-sm">
                    <div className="font-semibold text-black">
                    Rp {invoice.amount.toLocaleString('id-ID')}
                    </div>
                </div>
                <button
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
        </div>

        {/* Billing Address Section */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-md font-semibold text-black mb-1">Billing Address</h3>
              <p className="text-xs text-gray-600">Your billing information for invoices and receipts</p>
            </div>
            <button
              onClick={handleEditBillingAddress}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
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
                   <span className="text-xs text-gray-900">{billingAddress.companyName}</span>
                 </div>
               </div>
               <div>
                 <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                   <MapPin className="h-4 w-4 text-gray-400" />
                   Address
                 </label>
                 <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center">
                   <span className="text-xs text-gray-900">{billingAddress.address}</span>
                 </div>
               </div>
               <div className="grid grid-cols-2 gap-3">
                 <div>
                   <label className="text-xs font-medium text-gray-700 mb-2">City</label>
                   <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center">
                     <span className="text-xs text-gray-900">{billingAddress.city}</span>
                   </div>
                 </div>
                 <div>
                   <label className="text-xs font-medium text-gray-700 mb-2">State</label>
                   <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center">
                     <span className="text-xs text-gray-900">{billingAddress.state}</span>
                   </div>
                 </div>
               </div>
             </div>
             <div className="space-y-4">
               <div className="grid grid-cols-2 gap-3">
                 <div>
                   <label className="text-xs font-medium text-gray-700 mb-2">Postal Code</label>
                   <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center">
                     <span className="text-xs text-gray-900">{billingAddress.postalCode}</span>
                   </div>
                 </div>
                 <div>
                   <label className="text-xs font-medium text-gray-700 mb-2">Country</label>
                   <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center">
                     <span className="text-xs text-gray-900">{billingAddress.country}</span>
                   </div>
                 </div>
               </div>
               <div>
                 <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                   <Phone className="h-4 w-4 text-gray-400" />
                   Phone
                 </label>
                 <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center">
                   <span className="text-xs text-gray-900">{billingAddress.phone}</span>
                 </div>
               </div>
               <div>
                 <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                   <Mail className="h-4 w-4 text-gray-400" />
                   Email
                 </label>
                 <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center">
                   <span className="text-xs text-gray-900">{billingAddress.email}</span>
                 </div>
               </div>
             </div>
           </div>
        </div>
      </div>

      {/* Add/Edit Payment Method Modal */}
      {showAddPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-black">
                {editingPaymentId ? 'Edit Payment Method' : 'Add Payment Method'}
              </h3>
              <button
                onClick={() => {
                  setShowAddPaymentModal(false);
                  setEditingPaymentId(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="text-center py-4">
              <div className="text-gray-500 mb-2">Payment method form will be implemented</div>
              <div className="text-sm text-gray-400">This is a design preview</div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Billing Address Modal */}
      {showEditAddressModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-black">Edit Billing Address</h3>
              <button
                onClick={() => setShowEditAddressModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

             <form onSubmit={handleSaveBillingAddress} className="space-y-4">
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
                         onChange={(e) => setBillingAddress(prev => ({ ...prev, companyName: e.target.value }))}
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
                         onChange={(e) => setBillingAddress(prev => ({ ...prev, address: e.target.value }))}
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
                           onChange={(e) => setBillingAddress(prev => ({ ...prev, city: e.target.value }))}
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
                           onChange={(e) => setBillingAddress(prev => ({ ...prev, state: e.target.value }))}
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
                           onChange={(e) => setBillingAddress(prev => ({ ...prev, postalCode: e.target.value }))}
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
                           onChange={(e) => setBillingAddress(prev => ({ ...prev, country: e.target.value }))}
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
                         onChange={(e) => setBillingAddress(prev => ({ ...prev, phone: e.target.value }))}
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
                         onChange={(e) => setBillingAddress(prev => ({ ...prev, email: e.target.value }))}
                         className="w-full bg-transparent text-xs text-gray-900 outline-none"
                         placeholder="Enter email address"
                       />
                     </div>
                   </div>
                 </div>
               </div>

              {/* Action Buttons */}
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
                  className="px-4 py-2 text-sm font-medium text-white bg-[#0a61d7] rounded-lg hover:bg-[#0a52c0] transition-colors"
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
