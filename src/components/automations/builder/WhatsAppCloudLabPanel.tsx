'use client';

import React from 'react';
import { useAutomationTranslations } from '@/hooks/useAutomationTranslations';

const fieldClassName =
  'w-full rounded-lg border border-[#e6e6e6] bg-white px-3 py-2 text-xs text-black focus:outline-none focus:ring-2 focus:ring-[#0a61d7]';

type WhatsAppAppConfig = {
  phone?: string;
  phoneNumberId?: string;
  wabaId?: string;
  accessToken?: string;
  connected?: boolean;
  [key: string]: unknown;
};

type Props = {
  config: WhatsAppAppConfig;
  onChange: (next: WhatsAppAppConfig) => void;
};

export function WhatsAppCloudLabPanel({ config, onChange }: Props) {
  const { tBuilder } = useAutomationTranslations();
  const [testTo, setTestTo] = React.useState('');
  const [testText, setTestText] = React.useState(
    'Hello from Lakupak Automations (WhatsApp Cloud API test).',
  );
  const [sendBusy, setSendBusy] = React.useState(false);
  const [sendResult, setSendResult] = React.useState<string | null>(null);
  const [sendError, setSendError] = React.useState<string | null>(null);

  const [tplName, setTplName] = React.useState('laku_order_update');
  const [tplLanguage, setTplLanguage] = React.useState('en_US');
  const [tplCategory, setTplCategory] = React.useState('UTILITY');
  const [tplBody, setTplBody] = React.useState(
    'Your Lakupak order update: we received your request and will follow up shortly.',
  );
  const [tplBusy, setTplBusy] = React.useState(false);
  const [tplResult, setTplResult] = React.useState<string | null>(null);
  const [tplError, setTplError] = React.useState<string | null>(null);

  const patch = (partial: Partial<WhatsAppAppConfig>) => {
    onChange({ ...config, ...partial });
  };

  const credentialPayload = () => ({
    accessToken: String(config.accessToken ?? '').trim(),
    phoneNumberId: String(config.phoneNumberId ?? '').trim(),
    wabaId: String(config.wabaId ?? '').trim(),
  });

  const markConnectedIfReady = () => {
    const { accessToken, phoneNumberId } = credentialPayload();
    if (accessToken && phoneNumberId) {
      patch({ connected: true });
    }
  };

  const onSendTest = async () => {
    setSendBusy(true);
    setSendResult(null);
    setSendError(null);
    try {
      const res = await fetch('/api/automations/whatsapp/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...credentialPayload(),
          to: testTo.trim(),
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
        tBuilder('waCloudSendSuccess', { messageId: String(data.messageId ?? '') }),
      );
      markConnectedIfReady();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : tBuilder('waCloudSendFailed'));
    } finally {
      setSendBusy(false);
    }
  };

  const onCreateTemplate = async () => {
    setTplBusy(true);
    setTplResult(null);
    setTplError(null);
    try {
      const res = await fetch('/api/automations/whatsapp/create-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...credentialPayload(),
          name: tplName.trim(),
          language: tplLanguage.trim(),
          category: tplCategory.trim(),
          bodyText: tplBody.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        id?: string;
        status?: string;
        name?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `Create template failed (${res.status})`);
      }
      setTplResult(
        tBuilder('waCloudTemplateSuccess', {
          id: String(data.id ?? ''),
          status: String(data.status ?? ''),
          name: String(data.name ?? tplName),
        }),
      );
      markConnectedIfReady();
    } catch (err) {
      setTplError(err instanceof Error ? err.message : tBuilder('waCloudTemplateFailed'));
    } finally {
      setTplBusy(false);
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

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-600">
          {tBuilder('waCloudPhoneNumberId')}
        </span>
        <input
          type="text"
          value={String(config.phoneNumberId ?? '')}
          onChange={(e) => patch({ phoneNumberId: e.target.value })}
          className={fieldClassName}
          placeholder={tBuilder('waCloudPhoneNumberIdPlaceholder')}
          autoComplete="off"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-600">
          {tBuilder('waCloudWabaId')}
        </span>
        <input
          type="text"
          value={String(config.wabaId ?? '')}
          onChange={(e) => patch({ wabaId: e.target.value })}
          className={fieldClassName}
          placeholder={tBuilder('waCloudWabaIdPlaceholder')}
          autoComplete="off"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-600">
          {tBuilder('waCloudAccessToken')}
        </span>
        <input
          type="password"
          value={String(config.accessToken ?? '')}
          onChange={(e) => patch({ accessToken: e.target.value })}
          className={fieldClassName}
          placeholder={tBuilder('waCloudAccessTokenPlaceholder')}
          autoComplete="off"
        />
        <p className="mt-1 text-[11px] leading-snug text-gray-500">
          {tBuilder('waCloudCredentialsHint')}
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
        onClick={() => {
          if (config.connected) {
            patch({ connected: false });
            return;
          }
          const { accessToken, phoneNumberId } = credentialPayload();
          if (!accessToken || !phoneNumberId) {
            setSendError(tBuilder('waCloudNeedCredentials'));
            return;
          }
          patch({ connected: true });
        }}
        className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${
          config.connected
            ? 'border border-[#e6e6e6] bg-white text-black hover:bg-gray-50'
            : 'bg-[#25D366] text-white hover:bg-[#1ebe57]'
        }`}
      >
        {config.connected
          ? tBuilder('appDisconnectWhatsApp')
          : tBuilder('appConnectWhatsApp')}
      </button>
      <p className="text-[11px] leading-snug text-gray-500">
        {tBuilder('appWhatsAppConnectHint')}
      </p>

      <div className="space-y-2 rounded-lg border border-[#e6e6e6] bg-white p-3">
        <p className="text-xs font-semibold text-black">{tBuilder('waCloudSendTitle')}</p>
        <p className="text-[11px] leading-snug text-gray-500">{tBuilder('waCloudSendHint')}</p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600">
            {tBuilder('waCloudRecipient')}
          </span>
          <input
            type="tel"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            className={fieldClassName}
            placeholder={tBuilder('waCloudRecipientPlaceholder')}
            autoComplete="tel"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600">
            {tBuilder('waCloudMessage')}
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
          {sendBusy ? tBuilder('waCloudSending') : tBuilder('waCloudSendButton')}
        </button>
        {sendResult ? (
          <p className="text-[11px] leading-snug text-emerald-700">{sendResult}</p>
        ) : null}
        {sendError ? (
          <p className="text-[11px] leading-snug text-red-600">{sendError}</p>
        ) : null}
      </div>

      <div className="space-y-2 rounded-lg border border-[#e6e6e6] bg-white p-3">
        <p className="text-xs font-semibold text-black">{tBuilder('waCloudTemplateTitle')}</p>
        <p className="text-[11px] leading-snug text-gray-500">
          {tBuilder('waCloudTemplateHint')}
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600">
            {tBuilder('waCloudTemplateName')}
          </span>
          <input
            type="text"
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
            className={fieldClassName}
            placeholder={tBuilder('waCloudTemplateNamePlaceholder')}
            autoComplete="off"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">
              {tBuilder('waCloudTemplateLanguage')}
            </span>
            <select
              value={tplLanguage}
              onChange={(e) => setTplLanguage(e.target.value)}
              className={fieldClassName}
            >
              <option value="en_US">en_US</option>
              <option value="id">id</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">
              {tBuilder('waCloudTemplateCategory')}
            </span>
            <select
              value={tplCategory}
              onChange={(e) => setTplCategory(e.target.value)}
              className={fieldClassName}
            >
              <option value="UTILITY">UTILITY</option>
              <option value="MARKETING">MARKETING</option>
              <option value="AUTHENTICATION">AUTHENTICATION</option>
            </select>
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-600">
            {tBuilder('waCloudTemplateBody')}
          </span>
          <textarea
            value={tplBody}
            onChange={(e) => setTplBody(e.target.value)}
            className={`${fieldClassName} min-h-[72px] resize-y`}
            rows={3}
          />
        </label>
        <button
          type="button"
          disabled={tplBusy}
          onClick={() => void onCreateTemplate()}
          className="inline-flex w-full items-center justify-center rounded-lg bg-[#0a61d7] px-3 py-2 text-xs font-semibold text-white hover:bg-[#084ba6] disabled:opacity-60"
        >
          {tplBusy ? tBuilder('waCloudTemplateCreating') : tBuilder('waCloudTemplateButton')}
        </button>
        {tplResult ? (
          <p className="text-[11px] leading-snug text-emerald-700">{tplResult}</p>
        ) : null}
        {tplError ? (
          <p className="text-[11px] leading-snug text-red-600">{tplError}</p>
        ) : null}
      </div>
    </div>
  );
}
