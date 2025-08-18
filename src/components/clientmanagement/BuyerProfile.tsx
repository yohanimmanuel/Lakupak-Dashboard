import React from "react";
import { Mail, Phone, FileText, DollarSign } from "lucide-react";

const mockBuyer = {
  name: "Toko Sukses Jaya",
  businessType: "Retailer",
  contact: {
    phone: "0812-3456-7890",
    email: "suksesjaya@email.com",
  },
  paymentTerms: "Net 30",
  outstanding: "Rp 2,000,000",
  totalVolume: "Rp 24,000,000",
  orderHistory: [
    {
      id: "ORD-001",
      date: "2024-05-01",
      amount: "Rp 5,000,000",
      status: "Paid",
    },
    {
      id: "ORD-002",
      date: "2024-05-15",
      amount: "Rp 7,000,000",
      status: "Unpaid",
    },
    {
      id: "ORD-003",
      date: "2024-06-01",
      amount: "Rp 12,000,000",
      status: "Paid",
    },
  ],
};

export default function BuyerProfile({ buyer = mockBuyer, onClose }: { buyer?: typeof mockBuyer; onClose?: () => void }) {
  return (
    <div className="w-full max-w-xl mx-auto bg-white rounded-2xl shadow-lg p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#0a61d7]">{buyer.name}</h2>
          <div className="text-[#084ba6] text-sm font-medium">{buyer.businessType}</div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-[#0a61d7] hover:text-[#084ba6] text-xl font-bold">×</button>
        )}
      </div>
      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-1 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[#30812e]">
            <Phone className="w-4 h-4" />
            <span>{buyer.contact.phone}</span>
          </div>
          <div className="flex items-center gap-2 text-[#0a61d7]">
            <Mail className="w-4 h-4" />
            <span>{buyer.contact.email}</span>
          </div>
          <div className="flex items-center gap-2 text-[#084ba6]">
            <FileText className="w-4 h-4" />
            <span>Payment Terms: <span className="font-semibold">{buyer.paymentTerms}</span></span>
          </div>
          <div className="flex items-center gap-2 text-[#f65911]">
            <DollarSign className="w-4 h-4" />
            <span>Outstanding: <span className="font-semibold">{buyer.outstanding}</span></span>
          </div>
          <div className="flex items-center gap-2 text-[#30812e]">
            <DollarSign className="w-4 h-4" />
            <span>Total Volume: <span className="font-semibold">{buyer.totalVolume}</span></span>
          </div>
        </div>
        <div className="flex-1">
          <div className="font-semibold text-[#0a61d7] mb-2">Order History</div>
          <div className="flex flex-col gap-2">
            {buyer.orderHistory.map(order => (
              <div key={order.id} className="flex items-center justify-between bg-[#f7faff] rounded-lg px-3 py-2">
                <div>
                  <div className="font-medium text-[#084ba6]">{order.id}</div>
                  <div className="text-xs text-[#30812e]">{order.date}</div>
                </div>
                <div className="text-sm font-semibold">{order.amount}</div>
                <div className={order.status === 'Paid' ? 'text-[#30812e] font-bold' : 'text-[#f65911] font-bold'}>{order.status}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
