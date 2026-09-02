'use client';

import React from 'react';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';

const fieldClassName =
  'w-full rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-xs text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7]';

export type WhatsAppAppConfig = {
  phone?: string;
  connected?: boolean;
  [key: string]: unknown;
};

type Props = {
  config: WhatsAppAppConfig;
  onChange: (next: WhatsAppAppConfig) => void;
};

function sanitizeWhatsAppConfig(config: WhatsAppAppConfig): WhatsAppAppConfig {
  return {
    phone: String(config.phone ?? '').trim(),
    connected: Boolean(config.connected),
  };
}

function isValidBusinessPhone(raw: string): boolean {
  const compact = raw.trim().replace(/[\s\-()]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(compact)) return true;
  const digits = compact.replace(/^\+/, '').replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

export function WhatsAppCloudLabPanel({ config, onChange }: Props) {
  const { tBuilder } = useAutomationTranslations();
  const [connectError, setConnectError] = React.useState<string | null>(null);
  const [connectBusy, setConnectBusy] = React.useState(false);

  const patch = (partial: Partial<WhatsAppAppConfig>) => {
    onChange(sanitizeWhatsAppConfig({ ...config, ...partial }));
  };

  const onToggleConnect = async () => {
    setConnectError(null);
    if (config.connected) {
      patch({ connected: false });
      return;
    }

    const phone = String(config.phone ?? '').trim();
    if (!isValidBusinessPhone(phone)) {
      setConnectError(tBuilder('waCloudNeedPhone'));
      return;
    }

    setConnectBusy(true);
    try {
      const res = await fetch('/api/automations/whatsapp/connection-status');
      const data = (await res.json().catch(() => ({}))) as { configured?: boolean; error?: string };
      if (!res.ok || !data.configured) {
        throw new Error(data.error || tBuilder('waCloudServerNotConfigured'));
      }
      patch({ phone, connected: true });
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : tBuilder('waCloudServerNotConfigured'));
    } finally {
      setConnectBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-600">
          {tBuilder('appWhatsAppPhone')}
        </span>
        <input
          type="tel"
          value={String(config.phone ?? '')}
          onChange={(e) => patch({ phone: e.target.value })}
          className={fieldClassName}
          placeholder={tBuilder('appWhatsAppPhonePlaceholder')}
          autoComplete="tel"
        />
        <p className="mt-1 text-[11px] leading-snug text-gray-500">
          {tBuilder('appWhatsAppPhoneHint')}
        </p>
      </label>

      <div className="flex items-center justify-between gap-2 rounded-lg border border-[#e6e6e6] bg-[#fafafa] px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-black">{tBuilder('appWhatsAppAccount')}</p>
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
        disabled={connectBusy}
        onClick={() => void onToggleConnect()}
        className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60 ${
          config.connected
            ? 'border border-[#e6e6e6] bg-white text-black hover:bg-gray-50'
            : 'bg-[#25D366] text-white hover:bg-[#1ebe57]'
        }`}
      >
        {connectBusy
          ? tBuilder('appConnectingWhatsApp')
          : config.connected
            ? tBuilder('appDisconnectWhatsApp')
            : tBuilder('appConnectWhatsApp')}
      </button>
      <p className="text-[11px] leading-snug text-gray-500">{tBuilder('appWhatsAppConnectHint')}</p>
      {connectError ? (
        <p className="text-[11px] leading-snug text-red-600">{connectError}</p>
      ) : null}
    </div>
  );
}
