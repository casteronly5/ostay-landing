# OSTAY Members — Setup (Alibaba Cloud + Feishu)

Works for guests **in mainland China and abroad**, and your team never needs a VPN.

```
Website form ──▶ Alibaba Cloud Function Compute (Hong Kong)
                   ├─▶ Feishu Base (多维表格): member list, member number from an Auto Number field
                   └─▶ Alibaba Cloud DirectMail (邮件推送): welcome email from your own domain
Feishu Base automation ──▶ Feishu group message for every new member (optional)
```

When a guest submits **Join Free**:
1. a new row is added to the Feishu Base with a member number (`OSTAY-00001`, `OSTAY-00002`, …). Feishu assigns the number, so two guests signing up at the same moment can never get the same one;
2. the guest receives a welcome email with their number and benefits;
3. your team is notified (Feishu message and/or email);
4. if the email is already registered, no row is added: the guest receives their existing number again.

The website always shows the same message ("Please check your inbox"), so nobody can use the form to find out who is a member.

**Cost:** no server to rent. Function Compute and DirectMail both have free monthly/daily quotas; at OSTAY's volume the cost is typically zero or a few RMB a month (check current pricing in the console).

**Time:** about 1 hour, plus waiting for DNS (usually minutes, at most a few hours).

You need: an Alibaba Cloud account with real-name verification (实名认证), admin access to your Feishu workspace, and access to the DNS settings of `ostay.net`.

---

## Part 1 — Feishu Base (member list)

### 1.1 Create the table
1. In Feishu, create a new **Base (多维表格)** named `OSTAY Members`. Create it as a standalone Base (not inside a Wiki page).
2. Set up these fields in the first table — **the names must match exactly** (or see *Field names* at the end):

| Field name | Type (字段类型) | Settings |
|---|---|---|
| `Name` | Text (文本) | make this the first (primary) field |
| `Member ID` | Auto Number (自动编号) | Custom (自定义编号): fixed text `OSTAY-` + auto-increment number, **5 digits** |
| `Email` | Text (文本) | |
| `Joined at` | Date (日期) | show time |
| `Last request` | Date (日期) | show time |
| `Requests` | Number (数字) | integer |

3. From the Base's address bar, copy:
   - **Base token**: the part after `/base/` — `https://xxx.feishu.cn/base/`**`AbCdEf123`**`?table=…`
   - **Table ID**: the value after `table=` — starts with `tbl`.

### 1.2 Create a Feishu app (lets the function write to the Base)
1. Go to the Feishu developer console <https://open.feishu.cn/app> → **Create custom app (创建企业自建应用)**, name `OSTAY Members`.
2. **Credentials (凭证与基础信息)**: copy the **App ID** and **App Secret**.
3. **Permissions (权限管理)**: add `bitable:app` (*View, comment, edit and manage Base* / 查看、评论、编辑和管理多维表格).
4. **Version management (版本管理与发布)**: create a version and publish it. A workspace admin may need to approve it.
5. Open the `OSTAY Members` Base → **··· (top right) → Add document app (添加文档应用)** → choose `OSTAY Members` → permission **Can edit (可编辑)**.

### 1.3 Team notification in Feishu (optional, recommended)
In the Base: **Automations (自动化) → New (新建) → Trigger: When a record is added (新增记录时) → Action: Send Feishu message (发送飞书消息)** to your customer-service group, e.g. *New member: {Name} {Member ID} {Email}*.

---

## Part 2 — DirectMail (welcome emails)

Emails are sent from a sub-domain such as `mail.ostay.net`, so your existing `ostay.net` mailbox is not affected. Guests who reply will reach `vip@ostay.net`.

1. Alibaba Cloud console → **DirectMail (邮件推送)** → activate it. Choose the region **China (Hangzhou) 华东1** (it can send to any country).
2. **Sender domains (发信域名) → New domain**: `mail.ostay.net`.
3. Click **Configure (配置)**. The console shows several DNS records (ownership, SPF, DKIM, MX, optional DMARC). **Add every record exactly as shown** at your DNS provider for `ostay.net`, then click **Verify (验证)** until all are green.
4. **Sender addresses (发信地址) → New**: `members@mail.ostay.net`, type **Triggered (触发邮件)**. Set the **reply-to address (回信地址)** to `vip@ostay.net` and confirm the verification email sent to that mailbox.
5. Create a key for the function: **RAM console (访问控制) → Users → Create user** `ostay-mail`, enable **OpenAPI access**, attach the policy **AliyunDirectMailFullAccess**, and copy the **AccessKey ID** and **AccessKey Secret** (shown only once).

---

## Part 3 — Function Compute (the sign-up service)

1. Alibaba Cloud console → **Function Compute 3.0 (函数计算)** → switch the region to **China (Hong Kong) 中国香港** (no ICP filing needed; reachable from mainland China and abroad).
2. **Create function (创建函数) → Event function (事件函数)**:
   - Name: `ostay-members`
   - Runtime: **Node.js 20** (or 18)
   - Code: upload `index.js` from this folder (choose *Upload code* / *Upload ZIP* — a ZIP containing only `index.js` also works)
   - Handler: `index.handler`
   - Memory 128 MB, timeout 15 seconds
3. **Environment variables (环境变量)** — add:

| Name | Value |
|---|---|
| `FEISHU_APP_ID` | App ID from 1.2 |
| `FEISHU_APP_SECRET` | App Secret from 1.2 |
| `FEISHU_BASE_TOKEN` | Base token from 1.1 |
| `FEISHU_TABLE_ID` | Table ID from 1.1 (`tbl…`) |
| `ALIYUN_ACCESS_KEY_ID` | from Part 2, step 5 |
| `ALIYUN_ACCESS_KEY_SECRET` | from Part 2, step 5 |
| `SENDER_ADDRESS` | `members@mail.ostay.net` |
| `SENDER_NAME` | `OSTAY Members` |
| `WEBSITE_URL` | your live site, e.g. `https://www.ostay.net/` |
| `LOGO_URL` | e.g. `https://www.ostay.net/assets/brand/ostay-logo.png` |
| `PHONE` | `03 4588 3364` |
| `TEAM_EMAILS` | *optional*: emails that also get a "new member" email, comma-separated |
| `BASE_URL` | *optional*: link to the Base, shown in the team email |
| `ALLOW_ORIGIN` | *optional*: your site address, e.g. `https://www.ostay.net` (default `*`) |
| `FEISHU_HOST` | *only if you use Lark (international)*: `https://open.larksuite.com` |

4. **Triggers (触发器) → Create trigger → HTTP trigger**: methods **POST, OPTIONS, GET**; authentication **No authentication (无需认证)**. Copy the **public URL** (ends in `.fcapp.run`).
5. Open that URL in a browser: it should show `{"ok":true,"service":"OSTAY Members"}`.

---

## Part 4 — Connect the website

Open `content/site.json` and paste the function URL:

```json
"membership_endpoint": "https://ostay-members-xxxxxxxx.cn-hongkong.fcapp.run"
```

Publish the website, then test with your own email:
- a new row appears in the Base with `OSTAY-00001`
- you receive the welcome email (check spam the first time)
- your team receives the Feishu message / email
- submitting the same email again does **not** add a row, raises *Requests* to 2, and sends "Your OSTAY Members ID"

If something does not arrive: Function Compute → `ostay-members` → **Logs (日志)** shows `register_error` (Feishu settings/permissions) or `email_error` (DirectMail settings).

---

## Good to know

- **Editing the email text:** the texts are at the top of `index.js` (`const T = { … }`). Edit, re-upload `index.js`, done. `{{name}}`, `{{member_id}}`, `{{email}}`, `{{phone}}` are filled in automatically.
- **Pause all emails:** set `SEND_EMAILS` to `NO`.
- **Field names:** if you prefer other column names (e.g. Chinese), set `FIELD_NAME`, `FIELD_MEMBER_ID`, `FIELD_EMAIL`, `FIELD_JOINED`, `FIELD_LAST_REQUEST`, `FIELD_REQUESTS` to the names you used.
- **Existing members:** you can paste existing members into the Base by hand; new sign-ups continue the Auto Number sequence.
- **Privacy:** the Base holds personal data. Share it only with staff who need it, and mention the sign-up in your privacy policy.
- **Keys:** never put the App Secret or AccessKey into the website files — they belong only in the function's environment variables.
