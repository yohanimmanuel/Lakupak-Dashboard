'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import SalesDetails from '@/components/salesmarketing/SalesDetails';
import { SalesAgent } from '@/components/salesmarketing/TeamList';

export default function SalesDetailsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState<SalesAgent | null>(null);

  useEffect(() => {
    const agentId = searchParams.get('id');
    
    if (!agentId) {
      // If no ID provided, redirect back to team list
      router.push('/marketing/team');
      return;
    }

    // Fetch agent data - for now using sample data
    // In production, this would fetch from API
    const fetchAgent = async () => {
      setLoading(true);
      
      // Sample agent data - replace with actual API call
      const sampleAgent: SalesAgent = {
        id: agentId,
        name: 'Sarah Johnson',
        email: 'sarah.johnson@laku.com',
        phone: '+62 21 1234 5678',
        role: 'Sales Manager',
        status: 'active',
        territory: 'Jakarta & West Java',
        salesTarget: 50000000,
        currentSales: 42000000,
      };

      // Simulate API call
      setTimeout(() => {
        setAgent(sampleAgent);
        setLoading(false);
      }, 500);
    };

    fetchAgent();
  }, [searchParams, router]);

  if (loading) {
    return (
      <div className="w-full mx-auto p-4 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-[#0a61d7] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading agent details...</p>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="w-full mx-auto p-4 bg-gray-50 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Agent not found</p>
          <button
            onClick={() => router.push('/marketing/team')}
            className="px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#0851b8] transition-colors"
          >
            Back to Team List
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto p-4 bg-gradient-to-b from-gray-50 to-white min-h-screen">
      <div className="w-full mx-auto">
        <SalesDetails
          agent={agent}
          onBack={() => router.push('/marketing/team')}
          onEdit={() => {
            // Handle edit - could navigate to edit page or open modal
            console.log('Edit agent:', agent.id);
          }}
        />
      </div>
    </div>
  );
}
