# OSTAY Members — Sign-up & Email Setup

When a guest submits the **Join Free** form on the website:

1. their name and email are saved to a Google Sheet with a member ID (`OSTAY-00001`, `OSTAY-00002`, …)
2. the guest receives a **welcome email** with their member ID and benefits
3. the customer-service team receives a **new member** notification
4. if the email is already registered, no new row is added — the guest simply receives their existing member ID again

The website always shows the same message ("Please check your inbox"), so nobody can use the form to find out whether an email is already a member.

Cost: free (Google account only). No server, no other services.

---

## Setup (about 10 minutes)

> Use the Google account that should **send** the emails — ideally the account for `vip@ostay.net` (Google Workspace).
> Guests will see emails coming from this account.

### 1. Create the spreadsheet
1. Go to <https://sheets.new> and name the file **OSTAY Members**.
2. Menu **Extensions ▸ Apps Script**.
3. Delete everything in `Code.gs`, paste the full contents of [`Code.gs`](Code.gs), and click **Save** (💾).
4. In the toolbar, choose the function **`setup`** and click **Run**.
   Google asks for permission the first time → **Review permissions** → choose the account → **Advanced ▸ Go to project (unsafe)** → **Allow**.
   *(“Unsafe” only means the script is your own and not published by Google — it runs only in your account.)*
5. Back in the spreadsheet you now have four tabs: **Members**, **Settings**, **Emails**, **Log**.

### 2. Check the settings
In the **Settings** tab, confirm:

| Setting | What to put |
|---|---|
| Team notification emails | Who receives “new member” emails (comma-separated) |
| Reply-to email | Where guest replies go |
| Sender name | e.g. `OSTAY Members` |
| Member ID prefix / digits | `OSTAY-` and `5` → `OSTAY-00001` |
| Website URL / Phone / WhatsApp link / Logo URL | Used inside the emails |
| Send emails | `YES` (set `NO` to pause) |

Email wording is in the **Emails** tab. You can edit it freely. Placeholders:
`{{name}}` `{{member_id}}` `{{email}}` `{{joined_at}}` `{{phone}}` `{{sheet_url}}`.
Keep the line containing *member ID* and `{{member_id}}` — it is shown as the highlighted ID box.

Reload the spreadsheet → menu **OSTAY Members ▸ Send me a test welcome email** to preview.

### 3. Publish the sign-up endpoint
1. In Apps Script: **Deploy ▸ New deployment**.
2. Gear icon ▸ **Web app**.
3. *Execute as*: **Me** · *Who has access*: **Anyone**.
4. **Deploy** → copy the **Web app URL** (`https://script.google.com/macros/s/…/exec`).

### 4. Connect the website
Open `v2/content/site.json` (or the website admin) and paste the URL:

```json
"membership_endpoint": "https://script.google.com/macros/s/XXXXXXXX/exec"
```

Publish the website. Submit the form once with your own email to test:
- a new row appears in **Members**
- you receive the welcome email
- the team address receives the notification
- submitting the same email again does **not** add a row, and sends “Your OSTAY Members ID”

---

## Good to know

- **Daily sending limit (Google):** about 100 recipients/day on a free Gmail account, about 1,500/day on Google Workspace. Each new member uses 2 (guest + team). Check current limits at <https://developers.google.com/apps-script/guides/services/quotas>.
- **Changing the code later:** after editing `Code.gs`, use **Deploy ▸ Manage deployments ▸ Edit ▸ Version: New version** so the website URL stays the same.
- **Spam folder:** sending from a Google Workspace address on your own domain gives the best delivery. Make sure the domain’s SPF/DKIM records for Google Workspace are set up (Admin console ▸ Apps ▸ Gmail ▸ Authenticate email).
- **Privacy:** the sheet contains personal data. Share it only with staff who need it, and describe this sign-up in the website’s privacy policy. Remove a person’s row if they ask to be deleted.
- **Members tab columns:** Member ID · Name · Email · Joined at · Last request · Requests (how many times they submitted).
- **Log tab:** every sign-up and any email error, for troubleshooting.
