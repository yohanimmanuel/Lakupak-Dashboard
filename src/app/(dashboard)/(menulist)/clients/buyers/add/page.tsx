'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import BuyerModal from '@/components/clientmanagement/BuyerModal';
import { useLakuAiPanel } from '@/components/lakuAi/LakuAiPanelContext';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';
import type { Buyer } from '@/types/client';
import type { ProspectFormFill } from '@/lib/salesJobs/prospectFormFill';
import {
  mapProspectFillToBuyer,
  peekPendingProspectFill,
  PENDING_PROSPECT_FILL_EVENT,
  takePendingProspectFill,
  writePendingProspectFill,
} from '@/lib/lakuAi/pendingProspectFill';

export default function AddBuyerPage() {
  const router = useRouter();
  const { tBuyersModal } = useClientsTranslations();
  const { registerProspectAi, unregisterProspectAi } = useLakuAiPanel();
  const [prefill, setPrefill] = useState<Buyer | undefined>();
  // Bump on every accepted fill so remounts even when only owner/notes change.
  const [prefillNonce, setPrefillNonce] = useState(0);
  const [aiApplying, setAiApplying] = useState(false);
  const applySeqRef = useRef(0);

  const applyFill = useCallback(
    async (fill: ProspectFormFill) => {
      if (fill.buyerId) {
        writePendingProspectFill(fill);
        router.push(`/clients/buyers/edit/${encodeURIComponent(fill.buyerId)}`);
        return;
      }
      const seq = ++applySeqRef.current;
      setAiApplying(true);
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      if (seq !== applySeqRef.current) return;
      setPrefill(mapProspectFillToBuyer(fill));
      setPrefillNonce((n) => n + 1);
      setAiApplying(false);
    },
    [router],
  );

  useEffect(() => {
    registerProspectAi({ applyFill });
    return () => unregisterProspectAi();
  }, [registerProspectAi, unregisterProspectAi, applyFill]);

  useEffect(() => {
    const applyPending = () => {
      const pending = peekPendingProspectFill();
      // Edit-targeted fills keep buyerId; leave those for the edit page.
      if (!pending || pending.buyerId) return;
      const taken = takePendingProspectFill();
      if (!taken) return;
      void applyFill(taken);
    };
    applyPending();
    window.addEventListener(PENDING_PROSPECT_FILL_EVENT, applyPending);
    return () => window.removeEventListener(PENDING_PROSPECT_FILL_EVENT, applyPending);
  }, [applyFill]);

  return (
    <div className="relative flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
      {aiApplying ? (
        <div
          className="absolute inset-0 z-[35] flex items-center justify-center bg-white/50"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 rounded-lg border border-[#e6e6e6] bg-white px-4 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-[#0a61d7]" />
            <span className="text-sm font-medium text-black">{tBuyersModal('applyingFill')}</span>
          </div>
        </div>
      ) : null}
      <BuyerModal
        key={prefill ? `ai-${prefillNonce}` : 'add-buyer'}
        mode="add"
        initialData={prefill}
      />
    </div>
  );
}
