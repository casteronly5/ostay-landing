/**
 * OSTAY Members — sign-up function for Alibaba Cloud Function Compute (FC 3.0, Node.js 18/20).
 *
 * Website form → this function → Feishu (Lark) Base table + welcome email via Alibaba Cloud DirectMail.
 * Works for visitors in mainland China and abroad (deploy in the Hong Kong region, no ICP filing needed).
 *
 *  - Member numbers come from the Base table's Auto Number field (assigned by Feishu, never duplicated).
 *  - Same email again → no new row; the guest receives their existing member number again.
 *  - The website always gets the same answer, so nobody can probe who is a member.
 *
 * All settings are environment variables — see SETUP.md.
 * No npm packages are needed (uses Node's built-in fetch and crypto).
 */
'use strict';
const crypto = require('crypto');

/* ---------------- Settings (environment variables) ---------------- */

const env = (k, d = '') => (process.env[k] == null ? d : String(process.env[k]).trim());
const CFG = () => ({
  feishuHost: env('FEISHU_HOST', 'https://open.feishu.cn'),      // Lark (international): https://open.larksuite.com
  appId: env('FEISHU_APP_ID'),
  appSecret: env('FEISHU_APP_SECRET'),
  appToken: env('FEISHU_BASE_TOKEN'),                              // Base (多维表格) token
  tableId: env('FEISHU_TABLE_ID'),
  f: {                                                             // field names in the table
    id: env('FIELD_MEMBER_ID', 'Member ID'),
    name: env('FIELD_NAME', 'Name'),
    email: env('FIELD_EMAIL', 'Email'),
    joined: env('FIELD_JOINED', 'Joined at'),
    last: env('FIELD_LAST_REQUEST', 'Last request'),
    count: env('FIELD_REQUESTS', 'Requests'),
  },
  dmEndpoint: env('DM_ENDPOINT', 'https://dm.aliyuncs.com'),       // DirectMail API endpoint
  dmRegion: env('DM_REGION', 'cn-hangzhou'),
  accessKeyId: env('ALIYUN_ACCESS_KEY_ID'),                        // RAM user with AliyunDirectMailFullAccess
  accessKeySecret: env('ALIYUN_ACCESS_KEY_SECRET'),
  sender: env('SENDER_ADDRESS'),                                   // e.g. members@mail.ostay.net (verified in DirectMail)
  senderName: env('SENDER_NAME', 'OSTAY Members'),
  replyTo: env('USE_REPLY_TO', 'YES').toUpperCase() === 'YES',     // use the reply-to address set on the sender in DirectMail
  teamEmails: env('TEAM_EMAILS'),                                  // optional, comma-separated
  sendEmails: env('SEND_EMAILS', 'YES').toUpperCase() === 'YES',
  websiteUrl: env('WEBSITE_URL'),
  logoUrl: env('LOGO_URL'),
  phone: env('PHONE', '03 4588 3364'),
  baseUrl: env('BASE_URL'),                                        // link to the Base, shown in the team email
  allowOrigin: env('ALLOW_ORIGIN', '*'),                           // e.g. https://ostay.net
});

/* ---------------- Email texts ---------------- */

const T = {
  welcome_subject: 'Welcome to OSTAY Members, {{name}}',
  welcome_body:
    'Hi {{name}},\n\n' +
    'Welcome to OSTAY Members — it’s free, and your benefits start now.\n\n' +
    'Your member ID: {{member_id}}\n\n' +
    '• Real people on hand every day — 9:00–22:00 JST (Japan) · 8:00–23:00 ICT (Thailand)\n' +
    '• Complimentary local treats for every guest on your current booking (worth ¥1,500 per person)\n' +
    '• 5% off OTA prices on every direct booking from your next stay, plus your 6th night free — friends can use it too\n\n' +
    'Keep this email: when you book with us directly, just share your member ID.\n\n' +
    'Questions? Reply to this email, message us on WhatsApp, or call {{phone}}.\n\n' +
    'Stay Simple. Stay Curious.\nThe OSTAY team',
  welcome_back_subject: 'Your OSTAY Members ID',
  welcome_back_body:
    'Hi {{name}},\n\n' +
    'Good news — you’re already an OSTAY Member.\n\n' +
    'Your member ID: {{member_id}}\n\n' +
    'Share it when you book with us directly to use your member benefits.\n\n' +
    'Questions? Reply to this email or call {{phone}}.\n\n' +
    'The OSTAY team',
  team_subject: 'New OSTAY member: {{name}} ({{member_id}})',
  team_body:
    'A new member has joined.\n\n' +
    'Member ID: {{member_id}}\nName: {{name}}\nEmail: {{email}}\nJoined: {{joined_at}}\n\n' +
    'Full list: {{base_url}}',
};

/* ---------------- Entry point ---------------- */

exports.handler = async (event, context) => {
  const cfg = CFG();
  const req = parseEvent(event);
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': cfg.allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  const reply = (code, obj) => ({ statusCode: code, headers, body: JSON.stringify(obj) });

  if (req.method === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (req.method !== 'POST') return reply(200, { ok: true, service: 'OSTAY Members' });

  const p = req.params;
  if (clean(p._gotcha)) return reply(200, { ok: true });                // spam trap
  const name = clean(p.name).slice(0, 100);
  const email = clean(p.email).toLowerCase().slice(0, 200);
  if (!name || !isEmail(email)) return reply(400, { ok: false, error: 'invalid' });

  let result;
  try {
    result = await register(cfg, name, email);
  } catch (err) {
    console.error('register_error', email, err && err.message);
    return reply(500, { ok: false, error: 'server' });
  }

  if (cfg.sendEmails) {
    try { await sendEmails(cfg, result, context); }
    catch (err) { console.error('email_error', email, err && err.message); }
  }
  return reply(200, { ok: true });                                      // same answer for new and existing members
};

/* ---------------- Feishu Base ---------------- */

let tokenCache = { token: '', exp: 0 };

async function feishuToken(cfg) {
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;
  const r = await fetchJson(cfg.feishuHost + '/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ app_id: cfg.appId, app_secret: cfg.appSecret }),
  });
  if (r.code !== 0) throw new Error('feishu token: ' + r.code + ' ' + r.msg);
  tokenCache = { token: r.tenant_access_token, exp: Date.now() + (Number(r.expire) - 300) * 1000 };
  return tokenCache.token;
}

async function feishu(cfg, method, path, body) {
  const token = await feishuToken(cfg);
  const url = cfg.feishuHost + '/open-apis/bitable/v1/apps/' + cfg.appToken + '/tables/' + cfg.tableId + path;
  const r = await fetchJson(url, {
    method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=utf-8' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.code !== 0) throw new Error('feishu ' + method + ' ' + path + ': ' + r.code + ' ' + r.msg);
  return r.data || {};
}

/** Feishu returns text fields as plain strings or as [{text:"..."}]; normalise to a string. */
function text(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(x => (x && typeof x === 'object' ? x.text || '' : String(x))).join('');
  if (typeof v === 'object') return v.text || v.value || '';
  return String(v);
}

async function register(cfg, name, email) {
  const f = cfg.f;
  const now = Date.now();
  const found = await feishu(cfg, 'POST', '/records/search?page_size=1', {
    field_names: [f.id, f.name, f.email, f.count],
    filter: { conjunction: 'and', conditions: [{ field_name: f.email, operator: 'is', value: [email] }] },
  });
  const hit = (found.items || [])[0];
  if (hit) {
    const fields = hit.fields || {};
    const count = (Number(fields[f.count]) || 0) + 1;
    await feishu(cfg, 'PUT', '/records/' + hit.record_id, { fields: { [f.last]: now, [f.count]: count } });
    return { isNew: false, id: text(fields[f.id]), name: text(fields[f.name]) || name, email };
  }

  const created = await feishu(cfg, 'POST', '/records', {
    fields: { [f.name]: name, [f.email]: email, [f.joined]: now, [f.last]: now, [f.count]: 1 },
  });
  const rec = created.record || {};
  let id = text((rec.fields || {})[f.id]);
  if (!id && rec.record_id) {                                            // read the Auto Number back if not in the reply
    const got = await feishu(cfg, 'GET', '/records/' + rec.record_id);
    id = text(((got.record || {}).fields || {})[f.id]);
  }
  return { isNew: true, id, name, email, joinedAt: fmtDate(now) };
}

/* ---------------- Email (Alibaba Cloud DirectMail) ---------------- */

async function sendEmails(cfg, r, context) {
  const vars = {
    name: r.name, member_id: r.id, email: r.email, joined_at: r.joinedAt || '',
    phone: cfg.phone, base_url: cfg.baseUrl,
  };
  const body = fill(r.isNew ? T.welcome_body : T.welcome_back_body, vars);
  await directMail(cfg, context, {
    to: r.email,
    subject: fill(r.isNew ? T.welcome_subject : T.welcome_back_subject, vars),
    html: html(body, r.id, cfg),
    text: body,
  });
  if (r.isNew && cfg.teamEmails) {
    await directMail(cfg, context, {
      to: cfg.teamEmails.split(/[,;\s]+/).filter(Boolean).join(','),
      subject: fill(T.team_subject, vars),
      text: fill(T.team_body, vars),
    });
  }
}

async function directMail(cfg, context, m) {
  const cred = (context && context.credentials && context.credentials.accessKeyId)
    ? context.credentials                                                // FC role (STS), if one is attached
    : { accessKeyId: cfg.accessKeyId, accessKeySecret: cfg.accessKeySecret };
  if (!cred.accessKeyId || !cfg.sender) throw new Error('DirectMail not configured');
  const params = {
    Action: 'SingleSendMail', Version: '2015-11-23', Format: 'JSON', RegionId: cfg.dmRegion,
    AccessKeyId: cred.accessKeyId, SignatureMethod: 'HMAC-SHA1', SignatureVersion: '1.0',
    SignatureNonce: crypto.randomUUID(), Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    AccountName: cfg.sender, AddressType: '1', ReplyToAddress: cfg.replyTo ? 'true' : 'false',
    ToAddress: m.to, Subject: m.subject, FromAlias: cfg.senderName,
  };
  if (cred.securityToken) params.SecurityToken = cred.securityToken;
  if (m.html) params.HtmlBody = m.html;
  if (m.text) params.TextBody = m.text;
  params.Signature = signRpc('POST', params, cred.accessKeySecret);
  const res = await fetch(cfg.dmEndpoint + '/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: Object.keys(params).map(k => pct(k) + '=' + pct(params[k])).join('&'),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out.Code) throw new Error('DirectMail ' + res.status + ' ' + (out.Code || '') + ' ' + (out.Message || ''));
  return out;
}

/** Alibaba Cloud RPC signature (HMAC-SHA1, SignatureVersion 1.0). */
function signRpc(method, params, secret) {
  const canon = Object.keys(params).sort().map(k => pct(k) + '=' + pct(params[k])).join('&');
  const toSign = method + '&' + pct('/') + '&' + pct(canon);
  return crypto.createHmac('sha1', secret + '&').update(toSign, 'utf8').digest('base64');
}
function pct(s) {
  return encodeURIComponent(String(s))
    .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function html(textBody, memberId, cfg) {
  const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const paras = esc(textBody).split(/\n{2,}/).map(p => {
    if (memberId && p.indexOf(esc(memberId)) >= 0 && /member ID/i.test(p)) {
      return '<div style="margin:24px 0;padding:20px 24px;background:#FDFBF7;border-radius:14px;border-left:4px solid #E5A93C">' +
        '<div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#6b625a">Your member ID</div>' +
        '<div style="font-size:26px;font-weight:600;letter-spacing:.04em;margin-top:6px">' + esc(memberId) + '</div></div>';
    }
    return '<p style="margin:0 0 16px">' + p.replace(/\n/g, '<br>') + '</p>';
  }).join('');
  const btn = cfg.websiteUrl
    ? '<p style="margin:28px 0 8px"><a href="' + esc(cfg.websiteUrl) + '" style="display:inline-block;background:#E5A93C;color:#2D2926;text-decoration:none;font-weight:600;padding:14px 28px;border-radius:999px">Visit OSTAY</a></p>'
    : '';
  const logo = cfg.logoUrl ? '<img src="' + esc(cfg.logoUrl) + '" alt="OSTAY" height="28" style="display:block;height:28px;margin-bottom:28px">' : '';
  return '<div style="background:#F7F1E6;padding:32px 16px;font-family:Montserrat,Helvetica,Arial,sans-serif;color:#2D2926">' +
    '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:20px;padding:36px 32px;font-size:15px;line-height:1.6">' +
    logo + paras + btn + '</div>' +
    '<p style="max-width:560px;margin:16px auto 0;font-size:11px;color:#8a8178;text-align:center">You receive this email because you joined OSTAY Members. Reply to this email to unsubscribe.</p></div>';
}

/* ---------------- Helpers ---------------- */

function parseEvent(event) {
  let e = event;
  try { e = JSON.parse(Buffer.isBuffer(event) ? event.toString('utf8') : String(event)); } catch (_) { e = {}; }
  const method = ((e.requestContext && e.requestContext.http && e.requestContext.http.method) || e.method || 'GET').toUpperCase();
  let body = e.body || '';
  if (e.isBase64Encoded) body = Buffer.from(body, 'base64').toString('utf8');
  const ct = String((e.headers && (e.headers['content-type'] || e.headers['Content-Type'])) || '');
  let params = {};
  if (/json/i.test(ct)) { try { params = JSON.parse(body); } catch (_) { params = {}; } }
  else params = Object.fromEntries(new URLSearchParams(body));
  return { method, params };
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  const txt = await res.text();
  try { return JSON.parse(txt); } catch (_) { throw new Error('bad response ' + res.status + ' from ' + url); }
}

function fill(tpl, vars) { return String(tpl || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (vars[k] != null ? vars[k] : '')); }
function clean(v) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, '').trim(); }
function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
function fmtDate(ms) {
  return new Date(ms + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') + ' JST';
}

exports._test = { signRpc, pct, parseEvent, text, html };
