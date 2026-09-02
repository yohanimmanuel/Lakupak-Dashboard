/**
 * Meta WhatsApp Cloud API (Graph) helpers for Lakupak Automations.
 * Do not log access tokens.
 */

export const WHATSAPP_GRAPH_VERSION = 'v21.0';

const GRAPH_BASE = `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}`;
const GRAPH_FETCH_TIMEOUT_MS = 15_000;

export type WhatsAppCloudCredentials = {
  accessToken: string;
  phoneNumberId: string;
  wabaId: string;
};

export type SendTextMessageResult = {
  messageId: string;
  contacts?: Array<{ input?: string; wa_id?: string }>;
};

export type CreateMessageTemplateResult = {
  id: string;
  status: string;
  category?: string;
};

export class WhatsAppCloudApiError extends Error {
  readonly status: number;
  readonly code?: number;
  readonly fbtraceId?: string;

  constructor(message: string, status: number, code?: number, fbtraceId?: string) {
    super(message);
    this.name = 'WhatsAppCloudApiError';
    this.status = status;
    this.code = code;
    this.fbtraceId = fbtraceId;
  }
}

/** True when the provider result is unknown and a blind resend may duplicate delivery. */
export function isIndeterminateWhatsAppSendError(err: unknown): boolean {
  if (!(err instanceof Error)) return true;
  if (err instanceof WhatsAppCloudApiError) {
    if (err.status === 408 || err.status === 429) return true;
    if (err.status >= 500) return true;
    return false;
  }
  const name = err.name;
  return name === 'TimeoutError' || name === 'AbortError' || name === 'TypeError';
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function trimStr(value: unknown): string {
  return String(value ?? '').trim();
}

/**
 * Convert common AI/markdown emphasis to WhatsApp text formatting.
 * WhatsApp uses *bold* (single asterisks). **bold** leaves stray * visible on each side.
 */
export function normalizeWhatsAppMarkdown(text: string): string {
  let out = text;
  for (let i = 0; i < 3; i++) {
    const next = out
      .replace(/\*\*\*([^*\n]+)\*\*\*/g, '*$1*')
      .replace(/\*\*([^*\n]+)\*\*/g, '*$1*');
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Digits-only recipient for Cloud API (strips +, spaces, dashes). */
export function toWhatsAppCloudRecipient(raw: string): string {
  return raw.trim().replace(/[^\d]/g, '');
}

/** Normalize E.164-ish display numbers; returns null if empty. */
export function normalizeE164Phone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const compact = trimmed.replace(/[\s\-()]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(compact)) return compact;
  const digits = compact.replace(/^\+/, '').replace(/\D/g, '');
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function resolveWhatsAppCloudCredentials(partial?: {
  accessToken?: string | null;
  phoneNumberId?: string | null;
  wabaId?: string | null;
}): WhatsAppCloudCredentials | null {
  const accessToken =
    trimStr(partial?.accessToken) || trimStr(process.env.WHATSAPP_CLOUD_ACCESS_TOKEN);
  const phoneNumberId =
    trimStr(partial?.phoneNumberId) ||
    trimStr(process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID);
  const wabaId =
    trimStr(partial?.wabaId) || trimStr(process.env.WHATSAPP_CLOUD_WABA_ID);

  if (!accessToken) return null;
  return { accessToken, phoneNumberId, wabaId };
}

export function isWhatsAppCloudConfigured(): boolean {
  const creds = resolveWhatsAppCloudCredentials();
  return Boolean(creds?.accessToken && creds.phoneNumberId);
}

async function graphRequest(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<JsonRecord> {
  const timeoutSignal = AbortSignal.timeout(GRAPH_FETCH_TIMEOUT_MS);
  const signal =
    init?.signal != null && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal;
  const { signal: _callerSignal, ...rest } = init ?? {};

  let res: Response;
  try {
    res = await fetch(`${GRAPH_BASE}${path}`, {
      ...rest,
      signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new WhatsAppCloudApiError('WhatsApp Cloud API request timed out.', 504);
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new WhatsAppCloudApiError('WhatsApp Cloud API request was aborted.', 504);
    }
    throw err;
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  const body = asRecord(json) ?? {};
  if (!res.ok) {
    const errObj = asRecord(body.error);
    const message =
      trimStr(errObj?.message) ||
      trimStr(body.message) ||
      `WhatsApp Cloud API request failed (${res.status}).`;
    const code =
      typeof errObj?.code === 'number'
        ? errObj.code
        : typeof body.code === 'number'
          ? body.code
          : undefined;
    const fbtraceId = trimStr(errObj?.fbtrace_id) || undefined;
    throw new WhatsAppCloudApiError(message, res.status, code, fbtraceId);
  }

  return body;
}

export async function sendTextMessage(args: {
  accessToken: string;
  phoneNumberId: string;
  to: string;
  body: string;
  /** Returned on status webhooks for outbound delivery reconciliation. Max 200 chars. */
  bizOpaqueCallbackData?: string;
}): Promise<SendTextMessageResult> {
  const to = toWhatsAppCloudRecipient(args.to);
  const text = normalizeWhatsAppMarkdown(args.body).trim();
  if (!to) throw new WhatsAppCloudApiError('Recipient phone is required.', 400);
  if (!text) throw new WhatsAppCloudApiError('Message text is required.', 400);

  const callbackData = trimStr(args.bizOpaqueCallbackData).slice(0, 200);
  const payload: JsonRecord = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body: text },
  };
  if (callbackData) {
    payload.biz_opaque_callback_data = callbackData;
  }

  const data = await graphRequest(`/${encodeURIComponent(args.phoneNumberId)}/messages`, args.accessToken, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const messages = Array.isArray(data.messages) ? data.messages : [];
  const first = asRecord(messages[0]);
  const messageId = trimStr(first?.id);
  if (!messageId) {
    throw new WhatsAppCloudApiError('WhatsApp API returned no message id.', 502);
  }

  const contactsRaw = Array.isArray(data.contacts) ? data.contacts : undefined;
  const contacts = contactsRaw
    ?.map((c) => asRecord(c))
    .filter((c): c is JsonRecord => c != null)
    .map((c) => ({
      input: trimStr(c.input) || undefined,
      wa_id: trimStr(c.wa_id) || undefined,
    }));

  return { messageId, contacts };
}

const TEMPLATE_NAME_RE = /^[a-z0-9_]{1,512}$/;

export async function createMessageTemplate(args: {
  accessToken: string;
  wabaId: string;
  name: string;
  language: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  bodyText: string;
}): Promise<CreateMessageTemplateResult> {
  const wabaId = args.wabaId.trim();
  const name = args.name.trim().toLowerCase();
  const language = args.language.trim() || 'en_US';
  const bodyText = args.bodyText.trim();

  if (!wabaId) {
    throw new WhatsAppCloudApiError('WhatsApp Business Account ID (WABA ID) is required.', 400);
  }
  if (!TEMPLATE_NAME_RE.test(name)) {
    throw new WhatsAppCloudApiError(
      'Template name must be lowercase letters, numbers, and underscores only.',
      400,
    );
  }
  if (!bodyText) {
    throw new WhatsAppCloudApiError('Template body text is required.', 400);
  }

  const data = await graphRequest(
    `/${encodeURIComponent(wabaId)}/message_templates`,
    args.accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        name,
        language,
        category: args.category,
        components: [
          {
            type: 'BODY',
            text: bodyText,
          },
        ],
      }),
    },
  );

  const id = trimStr(data.id);
  const status = trimStr(data.status) || 'PENDING';
  if (!id) {
    throw new WhatsAppCloudApiError('WhatsApp API returned no template id.', 502);
  }

  return {
    id,
    status,
    category: trimStr(data.category) || args.category,
  };
}

/** Cloud API credentials come from server env (WHATSAPP_CLOUD_*), not the workflow UI. */
export function credentialsFromWhatsAppAppConfig(
  _config: Record<string, unknown> | null | undefined,
): WhatsAppCloudCredentials | null {
  return resolveWhatsAppCloudCredentials();
}
