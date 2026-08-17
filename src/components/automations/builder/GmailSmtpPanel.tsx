'use client';

import React from 'react';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';

const fieldClassName =
  'w-full rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-xs text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7]';

type GmailAppConfig = {
  email?: string;
  connected?: boolean;
  [key: string]: unknown;
};

type Props = {
  config: GmailAppConfig;
  onChangeAction: (next: GmailAppConfig) => void;
};

export function GmailSmtpPanel({ config, onChangeAction }: Props) {
  const { tBuilder } = useAutomationTranslations();
  const [connectError, setConnectError] = React.useState<string | null>(null);

  const patch = (partial: Partial<GmailAppConfig>) => {
    onChangeAction({ ...config, ...partial });
  };

  const setConnectedWithoutSecret = (connected: boolean) => {
    const next: GmailAppConfig = { ...config, connected };
    delete next.appPassword;
    onChangeAction(next);
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-600">
          {tBuilder('appGmailEmail')}
        </span>
        <input
          type="email"
          value={String(config.email ?? '')}
          onChange={(e) => patch({ email: e.target.value })}
          className={fieldClassName}
          placeholder={tBuilder('appGmailEmailPlaceholder')}
          autoComplete="email"
        />
        <p className="mt-1 text-[11px] leading-snug text-gray-500">
          {tBuilder('appGmailEmailHint')}
        </p>
      </label>

      <div className="flex items-center justify-between gap-2 rounded-lg border border-[#e6e6e6] bg-[#fafafa] px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-black">{tBuilder('appGmailAccount')}</p>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {config.connected ? tBuilder('appConnected') : tBuilder('appNotConnected')}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            config.connected
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          {config.connected
            ? tBuilder('appStatusConnected')
            : tBuilder('appStatusNotConnected')}
        </span>
      </div>

      <button
        type="button"
        onClick={() => {
          setConnectError(null);
          if (config.connected) {
            setConnectedWithoutSecret(false);
            return;
          }
          const email = String(config.email ?? '').trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setConnectError(tBuilder('gmailNeedCredentials'));
            return;
          }
          setConnectedWithoutSecret(true);
        }}
        className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${
          config.connected
            ? 'border border-[#e6e6e6] bg-white text-black hover:bg-gray-50'
            : 'bg-[#0a61d7] text-white hover:bg-[#084ba6]'
        }`}
      >
        {config.connected ? tBuilder('appDisconnectGmail') : tBuilder('appConnectGmail')}
      </button>
      <p className="text-[11px] leading-snug text-gray-500">{tBuilder('appGmailConnectHint')}</p>
      {connectError ? (
        <p className="text-[11px] leading-snug text-red-600">{connectError}</p>
      ) : null}
    </div>
  );
}
