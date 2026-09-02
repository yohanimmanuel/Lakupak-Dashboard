import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env');
const envText = fs.readFileSync(envPath, 'utf8');
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((line) => line && !line.trim().startsWith('#'))
    .map((line) => {
      const idx = line.indexOf('=');
      if (idx === -1) return null;
      const key = line.slice(0, idx).trim();
      let value = line.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return [key, value];
    })
    .filter(Boolean),
);

const userToken = env.WHATSAPP_CLOUD_ACCESS_TOKEN?.trim();
const wabaId = env.WHATSAPP_CLOUD_WABA_ID?.trim();
const verifyToken = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim();
const appId = env.META_APP_ID?.trim() || env.WHATSAPP_CLOUD_APP_ID?.trim() || '3483204508522557';
const appSecret = env.META_APP_SECRET?.trim() || env.WHATSAPP_CLOUD_APP_SECRET?.trim() || '';
const tunnelHost =
  process.argv[2]?.trim() ||
  env.WEBHOOK_PUBLIC_HOST?.trim() ||
  '';

if (!userToken || !wabaId || !verifyToken) {
  console.error('Missing WHATSAPP_CLOUD_ACCESS_TOKEN, WHATSAPP_CLOUD_WABA_ID, or WHATSAPP_WEBHOOK_VERIFY_TOKEN in .env');
  process.exit(1);
}

if (!tunnelHost) {
  console.error(
    'Missing tunnel host.\n' +
      'Start cloudflared, copy the trycloudflare.com host, then run:\n' +
      '  node scripts/register-whatsapp-webhook.mjs your-subdomain.trycloudflare.com',
  );
  process.exit(1);
}

const callbackUrl = `https://${tunnelHost.replace(/^https?:\/\//, '')}/api/automations/whatsapp/webhook`;
const graphVersion = 'v21.0';
const appAccessToken = appSecret ? `${appId}|${appSecret}` : '';

async function graphPost(url, body, bearer = userToken) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function graphGet(url, bearer = userToken) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

console.log('Callback URL:', callbackUrl);

const verifyProbe = await fetch(
  `${callbackUrl}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=probe123`,
);
const verifyText = await verifyProbe.text();
console.log('Tunnel verify probe:', verifyProbe.status, verifyText.slice(0, 80));
if (verifyProbe.status !== 200 || verifyText.trim() !== 'probe123') {
  console.error(
    '\nWebhook endpoint is not reachable through the tunnel.\n' +
      '- Keep npm run dev:all running on port 3000\n' +
      '- Keep cloudflared running\n' +
      '- Pass the current tunnel host as the script argument\n',
  );
  process.exit(1);
}

if (!appAccessToken) {
  console.error(
    '\nMETA_APP_SECRET is required. Meta hides the webhook UI for tech-provider apps,\n' +
      'so you must subscribe the messages field through the Graph API.\n\n' +
      '1. Open App settings > Basic (not Webhooks):\n' +
      `   https://developers.facebook.com/apps/${appId}/settings/basic/\n` +
      '2. Copy App secret into .env:\n' +
      '   META_APP_ID=3483204508522557\n' +
      '   META_APP_SECRET=your-app-secret\n' +
      '3. Re-run this script.\n',
  );
  process.exit(1);
}

console.log('\nStep 1: subscribe Lakupak Marketing app to WABA...');
const step1 = await graphPost(`https://graph.facebook.com/${graphVersion}/${wabaId}/subscribed_apps`, {});
console.log('Status:', step1.status, JSON.stringify(step1.json));

console.log('\nStep 2: subscribe app to WhatsApp messages field (app access token)...');
const step2 = await graphPost(
  `https://graph.facebook.com/${graphVersion}/${appId}/subscriptions`,
  {
    object: 'whatsapp_business_account',
    callback_url: callbackUrl,
    verify_token: verifyToken,
    fields: 'messages',
  },
  appAccessToken,
);
console.log('Status:', step2.status, JSON.stringify(step2.json));

console.log('\nStep 3: set per-WABA webhook override...');
const step3 = await graphPost(`https://graph.facebook.com/${graphVersion}/${wabaId}/subscribed_apps`, {
  override_callback_uri: callbackUrl,
  verify_token: verifyToken,
});
console.log('Status:', step3.status, JSON.stringify(step3.json));

console.log('\nStep 4: confirm WABA subscriptions...');
const step4 = await graphGet(`https://graph.facebook.com/${graphVersion}/${wabaId}/subscribed_apps`);
console.log('Status:', step4.status, JSON.stringify(step4.json, null, 2));

console.log('\nStep 5: confirm app subscriptions...');
const step5 = await graphGet(`https://graph.facebook.com/${graphVersion}/${appId}/subscriptions`, appAccessToken);
console.log('Status:', step5.status, JSON.stringify(step5.json, null, 2));

const ok =
  (step2.status >= 200 && step2.status < 300) &&
  (step3.status >= 200 && step3.status < 300);

if (ok) {
  console.log('\nWebhook registered. Send a WhatsApp message to your test number to verify inbound delivery.');
} else {
  console.error('\nRegistration incomplete. Check the statuses above.');
}

process.exit(ok ? 0 : 1);
