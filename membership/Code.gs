/**
 * OSTAY Members — sign-up handler (Google Apps Script)
 * --------------------------------------------------------------
 * The website "Join Free" form posts name + email here. The script:
 *   1. checks whether the email is already a member
 *   2. new member   → adds a row with the next member ID
 *      existing one → keeps the original ID (no new row)
 *   3. emails the guest (welcome / welcome-back, with member ID)
 *   4. emails the customer-service team (new members only)
 *
 * Everything you may want to change lives in the "Settings" and
 * "Emails" tabs of the spreadsheet — no code edits needed.
 * First-time setup: menu  OSTAY Members ▸ Set up sheets.
 */

const SHEET_MEMBERS = 'Members';
const SHEET_SETTINGS = 'Settings';
const SHEET_EMAILS = 'Emails';
const SHEET_LOG = 'Log';

const DEFAULT_SETTINGS = [
  ['Team notification emails', 'vip@ostay.net', 'Who gets the "new member" email. Separate several with commas.'],
  ['Member ID prefix', 'OSTAY-', 'Text before the number, e.g. OSTAY-00001'],
  ['Member ID digits', '5', 'Number of digits (5 → 00001)'],
  ['Sender name', 'OSTAY Members', 'Name guests see as the sender'],
  ['Reply-to email', 'vip@ostay.net', 'Where guest replies go'],
  ['Website URL', 'https://casteronly5.github.io/ostay-landing/v2/', 'Used for the button in the welcome email'],
  ['WhatsApp link', 'https://wa.me/818067467880', ''],
  ['Phone', '03 4588 3364', ''],
  ['Logo URL', 'https://casteronly5.github.io/ostay-landing/assets/brand/ostay-logo.png', 'Shown at the top of emails'],
  ['Send emails', 'YES', 'YES / NO — set NO to pause all emails'],
];

const DEFAULT_EMAILS = [
  ['welcome_subject', 'Welcome to OSTAY Members, {{name}}'],
  ['welcome_body',
    'Hi {{name}},\n\n' +
    'Welcome to OSTAY Members — it’s free, and your benefits start now.\n\n' +
    'Your member ID: {{member_id}}\n\n' +
    '• A real person on call every day — 9:00–22:00 JST (Japan) · 8:00–23:00 ICT (Thailand)\n' +
    '• A free OSTAY Local Pantry Selection for every guest on your current booking (normally ¥1,500 per person)\n' +
    '• 5% off OTA prices on every direct booking from your next stay, plus 1 extra night free on stays of 5+ nights — friends can use it too\n\n' +
    'Keep this email: when you book with us directly, just share your member ID.\n\n' +
    'Questions? Reply to this email, message us on WhatsApp, or call {{phone}}.\n\n' +
    'Stay Simple. Stay Curious.\nThe OSTAY team'],
  ['welcome_back_subject', 'Your OSTAY Members ID'],
  ['welcome_back_body',
    'Hi {{name}},\n\n' +
    'Good news — you’re already an OSTAY Member.\n\n' +
    'Your member ID: {{member_id}}\n\n' +
    'Share it when you book with us directly to use your member benefits.\n\n' +
    'Questions? Reply to this email or call {{phone}}.\n\n' +
    'The OSTAY team'],
  ['team_subject', 'New OSTAY member: {{name}} ({{member_id}})'],
  ['team_body',
    'A new member has joined.\n\n' +
    'Member ID: {{member_id}}\n' +
    'Name: {{name}}\n' +
    'Email: {{email}}\n' +
    'Joined: {{joined_at}}\n\n' +
    'Full list: {{sheet_url}}'],
];

/* ---------------- Menu & setup ---------------- */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('OSTAY Members')
    .addItem('Set up sheets', 'setup')
    .addItem('Send me a test welcome email', 'sendTestEmail')
    .addToUi();
}

function setup() {
  const ss = SpreadsheetApp.getActive();
  const members = getOrCreate_(ss, SHEET_MEMBERS);
  if (members.getLastRow() === 0) {
    members.appendRow(['Member ID', 'Name', 'Email', 'Joined at', 'Last request', 'Requests']);
    members.setFrozenRows(1);
    members.getRange('A1:F1').setFontWeight('bold');
    members.getRange('A:A').setNumberFormat('@');
  }
  const settings = getOrCreate_(ss, SHEET_SETTINGS);
  if (settings.getLastRow() === 0) {
    settings.appendRow(['Setting', 'Value', 'Note']);
    DEFAULT_SETTINGS.forEach(r => settings.appendRow(r));
    settings.getRange('A1:C1').setFontWeight('bold');
    settings.setColumnWidth(1, 220); settings.setColumnWidth(2, 360); settings.setColumnWidth(3, 420);
  }
  const emails = getOrCreate_(ss, SHEET_EMAILS);
  if (emails.getLastRow() === 0) {
    emails.appendRow(['Key', 'Text  ({{name}} {{member_id}} {{email}} {{joined_at}} {{phone}} {{sheet_url}})']);
    DEFAULT_EMAILS.forEach(r => emails.appendRow(r));
    emails.getRange('A1:B1').setFontWeight('bold');
    emails.setColumnWidth(1, 200); emails.setColumnWidth(2, 700);
    emails.getRange('B:B').setWrap(true);
  }
  const log = getOrCreate_(ss, SHEET_LOG);
  if (log.getLastRow() === 0) log.appendRow(['Time', 'Event', 'Email', 'Detail']);
  ss.setActiveSheet(members);
  try { SpreadsheetApp.getUi().alert('OSTAY Members sheets are ready. Next: Deploy ▸ New deployment ▸ Web app.'); } catch (e) {}
}

/* ---------------- Web endpoint ---------------- */

function doGet() {
  return json_({ ok: true, service: 'OSTAY Members' });
}

function doPost(e) {
  const p = (e && e.parameter) || {};
  const name = clean_(p.name).slice(0, 80);
  const email = clean_(p.email).toLowerCase().slice(0, 120);

  // Spam trap: real visitors never fill this hidden field.
  if (clean_(p._gotcha)) return json_({ ok: true });
  if (!name || !isEmail_(email)) return json_({ ok: false, error: 'invalid' });

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000); // one sign-up at a time → no duplicate IDs
  } catch (err) {
    log_('busy', email, String(err));
    return json_({ ok: false, error: 'busy' });
  }

  let result;
  try {
    result = register_(name, email);
  } finally {
    lock.releaseLock();
  }

  try {
    sendEmails_(result);
  } catch (err) {
    log_('email_error', email, String(err));
  }
  // Same answer for new and existing members (no way to probe who is a member).
  return json_({ ok: true });
}

/* ---------------- Core ---------------- */

function register_(name, email) {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET_MEMBERS);
  const now = new Date();
  const tz = ss.getSpreadsheetTimeZone() || 'Asia/Tokyo';
  const stamp = Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss');
  const last = sh.getLastRow();

  if (last > 1) {
    const emails = sh.getRange(2, 3, last - 1, 1).getValues();
    for (let i = 0; i < emails.length; i++) {
      if (String(emails[i][0]).trim().toLowerCase() === email) {
        const row = i + 2;
        const rec = sh.getRange(row, 1, 1, 6).getValues()[0];
        sh.getRange(row, 5, 1, 2).setValues([[stamp, (Number(rec[5]) || 1) + 1]]);
        log_('existing', email, rec[0]);
        return { isNew: false, id: rec[0], name: rec[1] || name, email, joinedAt: rec[3] };
      }
    }
  }

  const s = settings_();
  const prefix = s['Member ID prefix'] || 'OSTAY-';
  const digits = Math.max(1, Number(s['Member ID digits']) || 5);
  const next = nextNumber_(sh, prefix);
  const id = prefix + String(next).padStart(digits, '0');
  sh.appendRow([id, name, email, stamp, stamp, 1]);
  log_('new', email, id);
  return { isNew: true, id, name, email, joinedAt: stamp };
}

function nextNumber_(sh, prefix) {
  const last = sh.getLastRow();
  if (last < 2) return 1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  let max = 0;
  ids.forEach(r => {
    const s = String(r[0]);
    if (s.indexOf(prefix) === 0) {
      const n = parseInt(s.slice(prefix.length), 10);
      if (n > max) max = n;
    }
  });
  return max + 1;
}

/* ---------------- Email ---------------- */

function sendEmails_(r) {
  const s = settings_();
  if (String(s['Send emails'] || 'YES').toUpperCase() !== 'YES') return;
  const t = templates_();
  const vars = {
    name: r.name, member_id: r.id, email: r.email, joined_at: r.joinedAt,
    phone: s['Phone'] || '', sheet_url: SpreadsheetApp.getActive().getUrl(),
  };
  const opts = { name: s['Sender name'] || 'OSTAY Members' };
  if (s['Reply-to email']) opts.replyTo = s['Reply-to email'];

  const subj = fill_(r.isNew ? t.welcome_subject : t.welcome_back_subject, vars);
  const body = fill_(r.isNew ? t.welcome_body : t.welcome_back_body, vars);
  MailApp.sendEmail(Object.assign({ to: r.email, subject: subj, body: body, htmlBody: html_(body, r.id, s) }, opts));

  if (r.isNew && s['Team notification emails']) {
    MailApp.sendEmail({
      to: s['Team notification emails'],
      subject: fill_(t.team_subject, vars),
      body: fill_(t.team_body, vars),
      name: opts.name,
      replyTo: r.email,
    });
  }
}

function html_(text, memberId, s) {
  const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const paras = esc(text).split(/\n{2,}/).map(p => {
    if (p.indexOf(esc(memberId)) >= 0 && /member ID/i.test(p)) {
      return '<div style="margin:24px 0;padding:20px 24px;background:#FDFBF7;border-radius:14px;border-left:4px solid #E5A93C">' +
        '<div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#6b625a">Your member ID</div>' +
        '<div style="font-size:26px;font-weight:600;letter-spacing:.04em;margin-top:6px">' + esc(memberId) + '</div></div>';
    }
    return '<p style="margin:0 0 16px">' + p.replace(/\n/g, '<br>') + '</p>';
  }).join('');
  const btn = s['Website URL']
    ? '<p style="margin:28px 0 8px"><a href="' + esc(s['Website URL']) + '" style="display:inline-block;background:#E5A93C;color:#2D2926;text-decoration:none;font-weight:600;padding:14px 28px;border-radius:999px">Visit OSTAY</a></p>'
    : '';
  const logo = s['Logo URL'] ? '<img src="' + esc(s['Logo URL']) + '" alt="OSTAY" height="28" style="display:block;height:28px;margin-bottom:28px">' : '';
  return '<div style="background:#F7F1E6;padding:32px 16px;font-family:Montserrat,Helvetica,Arial,sans-serif;color:#2D2926">' +
    '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:20px;padding:36px 32px;font-size:15px;line-height:1.6">' +
    logo + paras + btn + '</div>' +
    '<p style="max-width:560px;margin:16px auto 0;font-size:11px;color:#8a8178;text-align:center">You receive this email because you joined OSTAY Members. Reply to this email to unsubscribe.</p></div>';
}

/* ---------------- Helpers ---------------- */

function settings_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_SETTINGS);
  const out = {};
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => { if (r[0]) out[String(r[0]).trim()] = String(r[1]).trim(); });
  return out;
}

function templates_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_EMAILS);
  const out = {};
  DEFAULT_EMAILS.forEach(r => (out[r[0]] = r[1]));
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => { if (r[0] && r[1]) out[String(r[0]).trim()] = String(r[1]); });
  return out;
}

function fill_(tpl, vars) {
  return String(tpl || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (vars[k] != null ? vars[k] : ''));
}

function clean_(v) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, '').trim(); }
function isEmail_(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function getOrCreate_(ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); }

function log_(event, email, detail) {
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_LOG);
    if (sh) sh.appendRow([new Date(), event, email, detail || '']);
  } catch (e) {}
}

function sendTestEmail() {
  const me = Session.getActiveUser().getEmail();
  const s = settings_();
  const t = templates_();
  const vars = { name: 'Test Guest', member_id: (s['Member ID prefix'] || 'OSTAY-') + '00000', email: me, joined_at: '', phone: s['Phone'] || '', sheet_url: '' };
  const body = fill_(t.welcome_body, vars);
  MailApp.sendEmail({ to: me, subject: '[TEST] ' + fill_(t.welcome_subject, vars), body: body, htmlBody: html_(body, vars.member_id, s), name: s['Sender name'] || 'OSTAY Members' });
  SpreadsheetApp.getUi().alert('Test email sent to ' + me);
}
