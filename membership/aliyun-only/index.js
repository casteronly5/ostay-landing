/**
 * OSTAY Members — sign-up service for Alibaba Cloud Function Compute (FC 3.0, Node.js 18/20).
 * Everything runs on Alibaba Cloud (Hong Kong region): works in mainland China and abroad, no VPN, no ICP filing.
 *
 *   Website form ──▶ this function ──▶ Tablestore (member list) + welcome email from your own mailbox (SMTP)
 *   Admin page (website /admin/) ──▶ this function ──▶ member list, search, Excel/CSV download
 *
 *  - Member numbers OSTAY-00001, 00002 … come from an atomic counter: never duplicated, even at the same second.
 *  - Same email again → no new member; the guest receives their existing number again.
 *  - The website always gets the same answer, so nobody can probe who is a member.
 *  - Tables are created automatically on first use.
 *
 * Settings are environment variables (see SETUP.md). Credentials for Tablestore come from the function's role.
 */
const crypto = require('crypto');
const tls = require('tls');
const TableStore = require('tablestore');
const Long = TableStore.Long;

/* ---------------- Settings (environment variables) ---------------- */

const env = (k, d = '') => (process.env[k] == null || process.env[k] === '' ? d : String(process.env[k]).trim());
const CFG = () => {
  const region = env('FC_REGION', env('ALIBABA_CLOUD_REGION', 'cn-hongkong'));
  const instance = env('OTS_INSTANCE');
  const website = env('WEBSITE_URL');
  const smtpUser = env('SMTP_USER');
  return {
    instance,
    otsEndpoint: env('OTS_ENDPOINT', instance ? `https://${instance}.${region}.ots.aliyuncs.com` : ''),
    membersTable: env('OTS_TABLE', 'ostay_members'),
    counterTable: env('OTS_COUNTER_TABLE', 'ostay_counter'),
    prefix: env('MEMBER_ID_PREFIX', 'OSTAY-'),
    digits: Math.max(1, Number(env('MEMBER_ID_DIGITS', '5')) || 5),
    adminPassword: env('ADMIN_PASSWORD'),
    smtpHost: env('SMTP_HOST', 'smtpdm.aliyun.com'),                // Alibaba Cloud DirectMail (邮件推送)
    smtpPort: Number(env('SMTP_PORT', '465')),                      // SSL
    smtpUser,                                                       // e.g. noreply@mail.ostay.net
    replyTo: env('REPLY_TO'),                                       // e.g. vip@ostay.net
    smtpPass: env('SMTP_PASS'),
    smtpInsecure: env('SMTP_TLS_INSECURE', 'NO').toUpperCase() === 'YES', // testing only
    senderName: env('SENDER_NAME', 'OSTAY Members'),
    teamEmails: env('TEAM_EMAILS', env('REPLY_TO', smtpUser)),                       // who gets "new member" emails
    sendEmails: env('SEND_EMAILS', 'YES').toUpperCase() === 'YES',
    websiteUrl: website,
    logoUrl: env('LOGO_URL', website ? website.replace(/\/?$/, '/') + 'assets/brand/ostay-logo.png' : ''),
    phone: env('PHONE', '03 4588 3364'),
    baseUrl: env('ADMIN_URL', website ? website.replace(/\/?$/, '/') + 'admin/' : ''),
    allowOrigin: env('ALLOW_ORIGIN', '*'),
  };
};

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
    'Member list: {{base_url}}',
};

/* ---------------- Entry point ---------------- */

exports.handler = async (event, context) => {
  const cfg = CFG();
  const req = parseEvent(event);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': cfg.allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  };
  const reply = (code, obj) => ({ statusCode: code, headers, body: JSON.stringify(obj) });

  if (req.method === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (req.method !== 'POST') return reply(200, { ok: true, service: 'OSTAY Members' });

  const p = req.params;
  let db;
  try { db = store(cfg, context); }
  catch (err) { console.error('config_error', err.message); return reply(500, { ok: false, error: 'server' }); }

  /* ----- admin: member list ----- */
  if (p.action === 'admin_list') {
    if (!cfg.adminPassword || !safeEqual(String(p.password || ''), cfg.adminPassword)) {
      await new Promise(r => setTimeout(r, 1200));                       // slow down guessing
      return reply(401, { ok: false, error: 'password' });
    }
    try { return reply(200, { ok: true, members: await listMembers(db, cfg) }); }
    catch (err) { console.error('admin_error', err && err.message); return reply(500, { ok: false, error: 'server' }); }
  }

  /* ----- sign-up ----- */
  if (clean(p._gotcha)) return reply(200, { ok: true });                // spam trap
  const name = clean(p.name).slice(0, 100);
  const email = clean(p.email).toLowerCase().slice(0, 200);
  if (!name || !isEmail(email)) return reply(400, { ok: false, error: 'invalid' });

  let result;
  try {
    result = await register(db, cfg, name, email);
  } catch (err) {
    console.error('register_error', email, err && (err.code || '') + ' ' + (err.message || err));
    return reply(500, { ok: false, error: 'server' });
  }
  if (cfg.sendEmails) {
    try { await sendEmails(cfg, result); }
    catch (err) { console.error('email_error', email, err && err.message); }
  }
  return reply(200, { ok: true });                                      // same answer for new and existing members
};

/* ---------------- Tablestore ---------------- */

let clientCache = null, tablesReady = false;

function store(cfg, context) {
  const c = context && context.credentials;
  if (!cfg.instance) throw new Error('OTS_INSTANCE not set');
  if (!c || !c.accessKeyId) throw new Error('no role credentials: give the function a role with AliyunOTSFullAccess');
  const key = c.accessKeyId + '|' + (c.securityToken || '');
  if (!clientCache || clientCache.key !== key) {
    clientCache = {
      key,
      client: new TableStore.Client({
        accessKeyId: c.accessKeyId, secretAccessKey: c.accessKeySecret, stsToken: c.securityToken,
        endpoint: cfg.otsEndpoint, instancename: cfg.instance, maxRetries: 3,
      }),
    };
  }
  return clientCache.client;
}

const call = (client, op, params) => new Promise((res, rej) => client[op](params, (e, d) => (e ? rej(e) : res(d))));
const attrs = row => Object.fromEntries((row && row.attributes || []).map(a => [a.columnName, a.columnValue]));
const num = v => (v && typeof v === 'object' && v.toNumber ? v.toNumber() : Number(v));

async function ensureTables(db, cfg) {
  if (tablesReady) return;
  for (const [table, pk] of [[cfg.membersTable, 'email'], [cfg.counterTable, 'name']]) {
    try { await call(db, 'describeTable', { tableName: table }); }
    catch (e) {
      if (!/OTSObjectNotExist|does not exist/i.test(String(e.code || '') + ' ' + String(e.message || ''))) throw e;
      try {
        await call(db, 'createTable', {
          tableMeta: { tableName: table, primaryKey: [{ name: pk, type: 'STRING' }] },
          reservedThroughput: { capacityUnit: { read: 0, write: 0 } },
          tableOptions: { timeToLive: -1, maxVersions: 1 },
        });
      } catch (e2) { if (!/OTSObjectAlreadyExist/i.test(String(e2.code || '') + String(e2.message || ''))) throw e2; }
      await new Promise(r => setTimeout(r, 3000));                      // new tables need a moment
    }
  }
  tablesReady = true;
}

async function retry(fn, tries = 4) {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) {
      const msg = String(e.code || '') + ' ' + String(e.message || '');
      if (i >= tries - 1 || !/OTSObjectNotExist|OTSTableNotReady|OTSServerBusy|OTSPartitionUnavailable|OTSTimeout|ECONN|ETIMEDOUT/i.test(msg)) throw e;
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
}

async function nextNumber(db, cfg) {
  const r = await retry(() => call(db, 'updateRow', {
    tableName: cfg.counterTable,
    condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
    primaryKey: [{ name: 'members' }],
    updateOfAttributeColumns: [{ INCREMENT: [{ n: Long.fromNumber(1) }] }],
    returnContent: { returnType: TableStore.ReturnType.AfterModify, returnColumns: ['n'] },
  }));
  const n = num(attrs(r.row).n);
  if (!n) throw new Error('counter did not return a value');
  return n;
}

async function register(db, cfg, name, email) {
  await ensureTables(db, cfg);
  const now = Date.now();
  const pk = [{ email }];
  const got = await retry(() => call(db, 'getRow', { tableName: cfg.membersTable, primaryKey: pk, maxVersions: 1 }));
  if (got.row && got.row.primaryKey) return existing(db, cfg, email, attrs(got.row), name, now);

  const id = cfg.prefix + String(await nextNumber(db, cfg)).padStart(cfg.digits, '0');
  try {
    await retry(() => call(db, 'putRow', {
      tableName: cfg.membersTable,
      condition: new TableStore.Condition(TableStore.RowExistenceExpectation.EXPECT_NOT_EXIST, null),
      primaryKey: pk,
      attributeColumns: [
        { member_id: id }, { name }, { joined_at: Long.fromNumber(now) },
        { last_request: Long.fromNumber(now) }, { requests: Long.fromNumber(1) },
      ],
    }));
  } catch (e) {
    // the same email was registered a split second earlier by a parallel request
    if (/OTSConditionCheckFail/i.test(String(e.code || '') + String(e.message || ''))) {
      const again = await call(db, 'getRow', { tableName: cfg.membersTable, primaryKey: pk, maxVersions: 1 });
      return existing(db, cfg, email, attrs(again.row), name, now);
    }
    throw e;
  }
  return { isNew: true, id, name, email, joinedAt: fmtDate(now) };
}

async function existing(db, cfg, email, a, name, now) {
  await retry(() => call(db, 'updateRow', {
    tableName: cfg.membersTable,
    condition: new TableStore.Condition(TableStore.RowExistenceExpectation.EXPECT_EXIST, null),
    primaryKey: [{ email }],
    updateOfAttributeColumns: [{ PUT: [{ last_request: Long.fromNumber(now) }] }, { INCREMENT: [{ requests: Long.fromNumber(1) }] }],
  }));
  return { isNew: false, id: a.member_id, name: a.name || name, email };
}

async function listMembers(db, cfg) {
  await ensureTables(db, cfg);
  const out = [];
  let start = [{ email: TableStore.INF_MIN }];
  for (let page = 0; page < 200 && start; page++) {
    const r = await call(db, 'getRange', {
      tableName: cfg.membersTable, direction: TableStore.Direction.FORWARD,
      inclusiveStartPrimaryKey: start, exclusiveEndPrimaryKey: [{ email: TableStore.INF_MAX }], limit: 1000,
    });
    for (const row of r.rows || []) {
      const a = attrs(row);
      out.push({
        member_id: a.member_id || '', name: a.name || '', email: row.primaryKey[0].value,
        joined_at: num(a.joined_at) || 0, last_request: num(a.last_request) || 0, requests: num(a.requests) || 1,
      });
    }
    start = r.nextStartPrimaryKey ? r.nextStartPrimaryKey.map(k => ({ [k.name]: k.value })) : null;
  }
  return out.sort((x, y) => (x.member_id < y.member_id ? -1 : 1));
}

function safeEqual(a, b) {
  const x = crypto.createHash('sha256').update(a).digest(), y = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(x, y);
}

/* ---------------- Email (SMTP, e.g. Alibaba Mail) ---------------- */

async function sendEmails(cfg, r) {
  const vars = {
    name: r.name, member_id: r.id, email: r.email, joined_at: r.joinedAt || '',
    phone: cfg.phone, base_url: cfg.baseUrl,
  };
  const body = fill(r.isNew ? T.welcome_body : T.welcome_back_body, vars);
  await sendMail(cfg, {
    to: r.email,
    subject: fill(r.isNew ? T.welcome_subject : T.welcome_back_subject, vars),
    html: html(body, r.id, cfg),
    text: body,
  });
  if (r.isNew && cfg.teamEmails) {
    await sendMail(cfg, {
      to: cfg.teamEmails.split(/[,;\s]+/).filter(Boolean).join(','),
      subject: fill(T.team_subject, vars),
      text: fill(T.team_body, vars),
      replyTo: r.email,
    });
  }
}

/** Minimal SMTP client (implicit TLS, AUTH LOGIN). Sends one message to one or more recipients. */
async function sendMail(cfg, m) {
  if (!cfg.smtpUser || !cfg.smtpPass) throw new Error('SMTP not configured');
  const to = String(m.to).split(',').map(x => x.trim()).filter(Boolean);
  const msg = buildMime(cfg, to, m);
  const sock = tls.connect({ host: cfg.smtpHost, port: cfg.smtpPort, servername: cfg.smtpHost, rejectUnauthorized: !cfg.smtpInsecure });
  sock.setEncoding('utf8');
  sock.setTimeout(15000, () => sock.destroy(new Error('SMTP timeout')));
  let buf = '';
  const waiters = [], pending = [];
  sock.on('data', d => {
    buf += d;
    for (;;) {
      const lines = buf.split('\r\n');                 // last element is an incomplete line
      const end = lines.slice(0, -1).findIndex(l => /^\d{3} /.test(l));
      if (end < 0) break;
      const reply = lines.slice(0, end + 1);
      buf = lines.slice(end + 1).join('\r\n');
      const w = waiters.shift();
      if (w) w(reply); else pending.push(reply);
    }
  });
  const errP = new Promise((_, rej) => { sock.on('error', rej); sock.on('close', () => rej(new Error('SMTP connection closed'))); });
  errP.catch(() => {});
  const next = () => pending.length ? Promise.resolve(pending.shift()) : Promise.race([new Promise(res => waiters.push(res)), errP]);
  const expect = async (codes, label) => {
    const r = await next();
    const code = Number(r[r.length - 1].slice(0, 3));
    if (!codes.includes(code)) throw new Error('SMTP ' + label + ': ' + r.join(' | '));
    return r;
  };
  const send = (line, codes, label) => { sock.write(line + '\r\n'); return expect(codes, label); };
  try {
    await expect([220], 'greeting');
    await send('EHLO ostay-members', [250], 'EHLO');
    await send('AUTH LOGIN', [334], 'AUTH');
    await send(Buffer.from(cfg.smtpUser).toString('base64'), [334], 'AUTH user');
    await send(Buffer.from(cfg.smtpPass).toString('base64'), [235], 'AUTH password');
    await send('MAIL FROM:<' + cfg.smtpUser + '>', [250], 'MAIL FROM');
    for (const r of to) await send('RCPT TO:<' + r + '>', [250, 251], 'RCPT TO');
    await send('DATA', [354], 'DATA');
    await send(msg + '\r\n.', [250], 'message');
    sock.write('QUIT\r\n');
  } finally {
    setTimeout(() => sock.destroy(), 200);
  }
}

function buildMime(cfg, to, m) {
  const b64 = s => Buffer.from(s, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
  const enc = s => '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';
  const boundary = 'ostay-' + crypto.randomBytes(8).toString('hex');
  const domain = (cfg.smtpUser.split('@')[1] || 'localhost');
  const head = [
    'From: ' + enc(cfg.senderName) + ' <' + cfg.smtpUser + '>',
    'To: ' + to.join(', '),
  ].concat((m.replyTo || cfg.replyTo) ? ['Reply-To: ' + (m.replyTo || cfg.replyTo)] : []).concat([
    'Subject: ' + enc(m.subject),
    'Date: ' + new Date().toUTCString().replace('GMT', '+0000'),
    'Message-ID: <' + crypto.randomUUID() + '@' + domain + '>',
    'MIME-Version: 1.0',
  ]);
  if (!m.html) {
    return head.concat(['Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(m.text || '')]).join('\r\n');
  }
  return head.concat([
    'Content-Type: multipart/alternative; boundary="' + boundary + '"', '',
    '--' + boundary, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(m.text || ''),
    '--' + boundary, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(m.html),
    '--' + boundary + '--',
  ]).join('\r\n');
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

function fill(tpl, vars) { return String(tpl || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (vars[k] != null ? vars[k] : '')); }
function clean(v) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, '').trim(); }
function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
function fmtDate(ms) {
  return new Date(ms + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') + ' JST';
}


exports._test = { buildMime, parseEvent, safeEqual };
