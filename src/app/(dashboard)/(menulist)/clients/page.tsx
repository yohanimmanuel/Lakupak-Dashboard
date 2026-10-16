'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Users,
  X,
  ArrowRight,
  UserPlus,
  Building2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useClientsTranslations } from '@/hooks/useClientsTranslations';

const TIP_CONFIG = [
  { id: 'add-new-buyers', icon: UserPlus, actionLink: '/clients/buyers' },
  { id: 'manage-suppliers', icon: Building2, actionLink: '/clients/suppliers' },
] as const;

type TipId = (typeof TIP_CONFIG)[number]['id'];

interface ClientTip {
  id: TipId;
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel: string;
  actionLink: string;
  mainPurpose?: string;
  fullDetails?: string[];
}

const TOOL_CONFIG = [
  { id: 'buyers' as const, icon: Users, link: '/clients/buyers' },
  { id: 'suppliers' as const, icon: Building2, link: '/clients/suppliers' },
];

export default function ClientsPage() {
  const { tHub } = useClientsTranslations();
  const [dismissedTips, setDismissedTips] = useState<Set<string>>(new Set());
  const [selectedTip, setSelectedTip] = useState<ClientTip | null>(null);

  const highPriorityTips: ClientTip[] = useMemo(
    () =>
      TIP_CONFIG.map(({ id, icon, actionLink }) => {
        const details: string[] = [];
        for (let i = 0; i < 10; i++) {
          const key = `tipsList.${id}.details.${i}` as const;
          if (!tHub.has(key)) break;
          details.push(tHub(key));
        }
        return {
          id,
          icon,
          actionLink,
          title: tHub(`tipsList.${id}.title`),
          description: tHub(`tipsList.${id}.description`),
          actionLabel: tHub(`tipsList.${id}.actionLabel`),
          mainPurpose: tHub(`tipsList.${id}.mainPurpose`),
          fullDetails: details.length > 0 ? details : undefined,
        };
      }),
    [tHub],
  );

  const clientTools = useMemo(
    () =>
      TOOL_CONFIG.map(({ id, icon, link }) => ({
        id,
        icon,
        link,
        name: tHub(`toolsList.${id}.name`),
        description: tHub(`toolsList.${id}.description`),
      })),
    [tHub],
  );

  const handleDismissTip = (tipId: string) => {
    setDismissedTips((prev) => new Set(prev).add(tipId));
  };

  const visibleTips = highPriorityTips.filter((tip) => !dismissedTips.has(tip.id));

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-black mb-2">{tHub('title')}</h1>
      </div>

      {visibleTips.length > 0 && (
        <section className="mb-8">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-black">{tHub('tips')}</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 @3xl/main:grid-cols-2 @5xl/main:grid-cols-3">
            {visibleTips.map((tip) => {
              const IconComponent = tip.icon;
              return (
                <div
                  key={tip.id}
                  className="relative rounded-lg border border-[#e6e6e6] bg-blue-50 p-4"
                >
                  <button
                    onClick={() => handleDismissTip(tip.id)}
                    className="absolute top-3 right-3 p-1 hover:bg-blue-100 rounded-full transition-colors"
                    aria-label={tHub('dismissTip')}
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                  <div className="flex items-start gap-3 pr-6">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-[#0a61d7]">
                      <IconComponent className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <button
                        onClick={() => setSelectedTip(tip)}
                        className="text-sm font-semibold text-black mb-1 hover:text-[#0a61d7] transition-colors text-left"
                      >
                        {tip.title}
                      </button>
                      <p className="text-xs text-gray-600 mb-3">{tip.description}</p>
                      <Link
                        href={tip.actionLink}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#0a61d7] hover:text-[#084ba6] transition-colors"
                      >
                        {tip.actionLabel}
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold text-black mb-4">{tHub('tools')}</h2>
        <div className="grid grid-cols-1 gap-4 @4xl/main:grid-cols-2">
          {clientTools.map((tool) => {
            const IconComponent = tool.icon;
            return (
              <Link
                key={tool.id}
                href={tool.link}
                className="group rounded-lg border border-[#e6e6e6] bg-white p-6 transition-all hover:border-[#0a61d7]"
              >
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-lg bg-[#f7faff] flex items-center justify-center text-[#0a61d7] mb-4 group-hover:bg-[#0a61d7] group-hover:text-white transition-colors">
                    <IconComponent className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-semibold text-black mb-2">{tool.name}</h3>
                  <p className="text-sm text-gray-600">{tool.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {selectedTip && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedTip(null);
            }
          }}
        >
          <div className="bg-white rounded-lg border border-[#e6e6e6] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="bg-white border-b border-[#e6e6e6] p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-[#0a61d7]">
                  {(() => {
                    const IconComponent = selectedTip.icon;
                    return <IconComponent className="w-5 h-5" />;
                  })()}
                </div>
                <h2 className="text-xl font-bold text-black">{selectedTip.title}</h2>
              </div>
              <button
                onClick={() => setSelectedTip(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label={tHub('closeModal')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-6">
                {selectedTip.mainPurpose && (
                  <div>
                    <h3 className="text-base font-semibold text-black mb-2">{tHub('mainPurpose')}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{selectedTip.mainPurpose}</p>
                  </div>
                )}

                {selectedTip.fullDetails && selectedTip.fullDetails.length > 0 && (
                  <div>
                    <h3 className="text-base font-semibold text-black mb-3">{tHub('details')}</h3>
                    <ul className="space-y-2">
                      {selectedTip.fullDetails.map((detail, index) => (
                        <li key={index} className="flex items-start gap-3">
                          <span className="text-[#0a61d7] flex-shrink-0 mt-0.5">•</span>
                          <span className="text-sm text-gray-600 leading-relaxed flex-1">{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="pt-4 -mx-6 px-6 border-t border-[#e6e6e6]">
                  <Link
                    href={selectedTip.actionLink}
                    onClick={() => setSelectedTip(null)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#0a61d7] text-white rounded-lg hover:bg-[#084ba6] transition-colors text-sm font-semibold"
                  >
                    {selectedTip.actionLabel}
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
