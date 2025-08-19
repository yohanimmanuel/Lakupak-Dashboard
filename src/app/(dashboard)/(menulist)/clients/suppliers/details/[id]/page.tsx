'use client';
import SupplierProfile from '@/components/clientmanagement/SupplierProfile';
import { useParams } from 'next/navigation';
import React, { useEffect, useState } from 'react';

export default function SupplierDetailsPage() {
  const params = useParams();
  const id = params.id;
  const [supplier, setSupplier] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/suppliers?id=${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch supplier');
        return res.json();
      })
      .then((data) => {
        setSupplier(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-4 text-red-500">{error}</div>;
  if (!supplier) return <div className="p-4">No supplier found.</div>;

  return (
    <div className="w-full min-h-screen flex items-start justify-center bg-gradient-to-b from-gray-50 to-white p-4">
      <SupplierProfile supplier={supplier} />
    </div>
  );
}
