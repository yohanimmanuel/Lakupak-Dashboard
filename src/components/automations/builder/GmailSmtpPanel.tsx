'use client';

import React from 'react';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';

const fieldClassName =
  'w-full rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-xs text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7]';

type GmailAppConfig = {
  email?: string;
  appPassword?: string;
  connected?: boolean;
  [key: string]: unknown;
};

type Props = {
  config: GmailAppConfig;
  onChange: (next: GmailAppConfig) => void;
};

export function GmailSmtpPanel({ config, onChange }: Props) {
  const { tBuilder } = useAutomationTranslations();
  const [testTo, setTestTo] = React.useState('');
  const [testSubject, setTestSubject] = React.useState('Hello from Laku Automations');
  const [testText, setTestText] = React.useState(
    'This is a Gmail SMTP test from Laku Automations.',
  );
  const [sendBusy, setSendBusy] = React.useState(false);
  const [sendResult, setSendResult] = React.useState<string | null>(null);
  const [sendError, setSendError] = React.useState<string | null>(null);

  const patch = (partial: Partial<GmailAppConfig>) => {
    onChange({ ...config, ...partial });
  };

  const credentialPayload = () => ({
    email: String(config.email ?? '').trim(),
    appPassword: String(config.appPassword ?? '').trim(),
  });

  const onSendTest = async () => {
    setSendBusy(true);
    setSendResult(null);
    setSendError(null);
    try {
      const res = await fetch('/api/automations/gmail/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...credentialPayload(),
          to: testTo.trim(),
          subject: testSubject.trim(),
          text: testText.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        messageId?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `Send failed (${res.status})`);
      }
      setSendResult(
        tBuilder('gmailSendSuccess', { messageId: String(data.messageId ?? '') }),
      );
      const { email, appPassword } = credentialPayload();
      if (email && appPassword) patch({ connected: true });
    } catch (err) {
      setSendError(err instanceof Error ? err.message : tBuilder('gmailSendFailed'));
    } finally {
      setSendBusy(false);
    }
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

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-600">
          {tBuilder('gmailAppPassword')}
        </span>
        <input
          type="password"
          value={String(config.appPassword ?? '')}
          onChange={(e) => patch({ appPassword: e.target.value })}
          className={fieldClassName}
          placeholder={tBuilder('gmailAppPasswordPlaceholder')}
          autoComplete="off"
        />
        <p className="mt-1 text-[11px] leading-snug text-gray-500">
          {tBuilder('gmailCredentialsHint')}
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
          if (config.connected) {
            patch({ connected: false });
            return;
          }
          const { email, appPassword } = credentialPayload();
          if (!email || !appPassword) {
            setSendError(tBuilder('gmailNeedCredentials'));
            return;
          }
          patch({ connected: true });
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

      <div className="space-y-2 rounded-lg border border-[#e6e6e6] bg-white p-3">
        <p className="text-xs font-semibold text-black">{tBuilder('gmailSendTitle')}</p>
        <p className="text-[11px] leading-snug text-gray-500">{tBuilder('gmailSendHint')}</p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600">
            {tBuilder('gmailRecipient')}
          </span>
          <input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            className={fieldClassName}
            placeholder={tBuilder('gmailRecipientPlaceholder')}
            autoComplete="email"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600">
            {tBuilder('gmailSubject')}
          </span>
          <input
            type="text"
            value={testSubject}
            onChange={(e) => setTestSubject(e.target.value)}
            className={fieldClassName}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600">
            {tBuilder('gmailMessage')}
          </span>
          <textarea
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            className={`${fieldClassName} min-h-[72px] resize-y`}
            rows={3}
          />
        </label>
        <button
          type="button"
          disabled={sendBusy}
          onClick={() => void onSendTest()}
          className="inline-flex w-full items-center justify-center rounded-lg bg-[#0a61d7] px-3 py-2 text-xs font-semibold text-white hover:bg-[#084ba6] disabled:opacity-60"
        >
          {sendBusy ? tBuilder('gmailSending') : tBuilder('gmailSendButton')}
        </button>
        {sendResult ? (
          <p className="text-[11px] leading-snug text-emerald-700">{sendResult}</p>
        ) : null}
        {sendError ? (
          <p className="text-[11px] leading-snug text-red-600">{sendError}</p>
        ) : null}
      </div>
    </div>
  );
}
