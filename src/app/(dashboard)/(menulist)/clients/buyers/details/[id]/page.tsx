'use client';

import BuyerProfile from '@/components/clientmanagement/BuyerProfile';
import { useParams } from 'next/navigation';
import React, { useEffect, useState } from 'react';

export default function BuyerDetailsPage() {
  const params = useParams();
  const id = params.id;
  const [buyer, setBuyer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/buyers?id=${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch buyer');
        return res.json();
      })
      .then((data) => {
        setBuyer(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-4 text-red-500">{error}</div>;
  if (!buyer) return <div className="p-4">No buyer found.</div>;

  return (
    <div className="p-4 w-full min-h-screen flex items-start justify-center bg-gradient-to-b from-gray-50 to-white">
      <BuyerProfile buyer={buyer} />
    </div>
  );
}
