# OSTAY Members — Setup (Alibaba Cloud only)

Everything runs on Alibaba Cloud in the **Hong Kong region**: works for guests in mainland China and abroad, no VPN, no ICP filing.

```
Website form ──▶ Function Compute (ostay-members)
                   ├─▶ Tablestore: member list (tables are created automatically)
                   └─▶ welcome email + team notification from your Alibaba Mail mailbox (vip@ostay.net, SMTP)
Admin page  https://<your-site>/admin/ ──▶ member list, search, Excel (CSV) download — password protected
```

- Member numbers `OSTAY-00001`, `00002`, … come from an atomic counter: two guests signing up at the same moment never get the same number. (Very rarely a number can be skipped; numbers are never reused.)
- Same email again → no new member; the guest receives their existing number again.
- The website always shows the same message, so nobody can probe who is a member.

**Cost:** pay-as-you-go; at OSTAY's volume Function Compute and Tablestore typically cost nothing or a few RMB a month (check current pricing in the console). Emails go through your existing mailbox.

## Files
| File | What it is |
|---|---|
| `ostay-members.zip` | The function, ready to upload (single bundled `index.js`) |
| `source/index.js` | Readable source (needs the `tablestore` npm package if you rebuild) |
| `../admin/index.html` | Admin page (part of the website) |

## Setup

1. **Tablestore**: console → Tablestore → region **China (Hong Kong)** → create an instance, e.g. `ostay-members`.
2. **Function Compute 3.0**, region **China (Hong Kong)** → *Create function → Event function*:
   runtime **Node.js 20** (or 18), upload `ostay-members.zip`, handler `index.handler`, memory 256 MB, timeout **30 s**.
3. **Function role**: create a role with **AliyunOTSFullAccess** and attach it to the function (Permissions → Function role).
4. **Environment variables**:

| Name | Value |
|---|---|
| `OTS_INSTANCE` | the Tablestore instance name |
| `SMTP_USER` | sending mailbox, e.g. `vip@ostay.net` |
| `SMTP_PASS` | its password, or client security password (三方客户端安全密码) |
| `ADMIN_PASSWORD` | password for the admin page (12+ characters) |
| `WEBSITE_URL` | live site, e.g. `https://www.ostay.net/` (also builds the logo and admin links in emails) |
| `TEAM_EMAILS` | *optional*: who gets "new member" emails, comma-separated (default: `SMTP_USER`) |
| `SEND_EMAILS` | *optional*: `NO` pauses all emails |
| `SMTP_HOST` / `SMTP_PORT` | *optional*: another mail provider (default `smtp.qiye.aliyun.com` / `465`, SSL) |

   Make sure **IMAP/SMTP is enabled** for the mailbox (Alibaba Mail → Settings → Accounts & security).
5. **Logs**: enable logging for the function.
6. **HTTP trigger**: methods POST, GET, OPTIONS; authentication **none**. Opening its URL should show `{"ok":true,"service":"OSTAY Members"}`.
7. Put that URL in the website's `content/site.json`: `"membership_endpoint": "https://…fcapp.run"`.

## Test
- Sign up with your own email: welcome email with `OSTAY-00001`, team notification arrives.
- Same email again: "Your OSTAY Members ID", same number.
- `/admin/` with the admin password shows the member and downloads a CSV.
- Problems → Function Compute → `ostay-members` → Logs: `config_error` (no role / wrong `OTS_INSTANCE`), `register_error` (Tablestore instance or region), `email_error` (mailbox password / SMTP not enabled).

## Maintenance
- **Email texts**: edit `const T = { … }` at the top of `source/index.js`, rebuild (`npm i tablestore && npx esbuild source/index.js --bundle --platform=node --outfile=index.js`), zip and re-upload; or ask your developer.
- **Change mailbox or password / admin password**: edit the environment variables.
- **Member data** stays in your Tablestore instance; the admin page exports it as CSV at any time.
