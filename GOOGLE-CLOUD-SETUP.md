# Put the Rosier server on Google Cloud (Mumbai)

The server (`server/` folder) runs the admin panel, the app's content, login, notifications,
and the privacy / terms / delete-account pages. This guide puts it on **Google Cloud Run**
with a **Cloud SQL** database, both in **Mumbai (asia-south1)**. Google looks after the
machines; you never manage a server.

Everything is done in your web browser. Commands are pasted into **Cloud Shell**, Google's
terminal inside the console, so nothing needs installing on your computer.

**Cost:** about ₹11,000–13,000 a month (one always-on server + small database).
New Google Cloud accounts get $300 free credit for 90 days.

---

## 1. Account and project

1. Go to **console.cloud.google.com** and sign in with the company app Gmail.
2. **Start free / Activate.** Country **India**, account type **Business**, company details,
   GSTIN, company card. Approve your bank's auto-pay (e-mandate) request.
3. Project picker (top bar) → **New project** → name `rosier-app` → **Create**, then select it.
4. ☰ → **Billing → Budgets & alerts → Create budget**: ₹15,000 a month, email alert on.
5. Click the **>_** icon (top right) to open **Cloud Shell**.

## 2. Turn on services and create the database

Paste each block into Cloud Shell and press Enter. Replace `rosier-app-12345` with your
**project ID** (shown in the project picker).

```bash
gcloud config set project rosier-app-12345
gcloud services enable run.googleapis.com sqladmin.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

Create the database in Mumbai (small size, daily backups at 2:30 am IST). Takes ~10 minutes:

```bash
gcloud sql instances create rosier-db --database-version=POSTGRES_17 --edition=ENTERPRISE --tier=db-g1-small --region=asia-south1 --storage-size=20GB --storage-auto-increase --backup-start-time=21:00
```

Set the database password (**letters and numbers only**, save it safely) and create the app's database:

```bash
gcloud sql users set-password postgres --instance=rosier-db --prompt-for-password
gcloud sql databases create rosier_app --instance=rosier-db
```

Let the app reach the database:

```bash
PN=$(gcloud projects describe $GOOGLE_CLOUD_PROJECT --format='value(projectNumber)')
gcloud projects add-iam-policy-binding $GOOGLE_CLOUD_PROJECT --member=serviceAccount:$PN-compute@developer.gserviceaccount.com --role=roles/cloudsql.client
gcloud projects add-iam-policy-binding $GOOGLE_CLOUD_PROJECT --member=serviceAccount:$PN-compute@developer.gserviceaccount.com --role=roles/run.builder
```

## 3. Get the code into Cloud Shell

**From GitHub** (replace with your account and repository name):

```bash
git clone https://github.com/YOUR-ACCOUNT/rosier-app.git
cd rosier-app/server
```

For a private repository, GitHub asks for a username and password. Use a
**personal access token** as the password (GitHub → Settings → Developer settings →
Personal access tokens).

**Or from the zip:** Cloud Shell **⋮ → Upload** → choose the zip, then
`unzip -q Rosier-app-with-admin.zip && cd Rosier-app-main/server`

## 4. (Optional) Copy your data from Render

Skip this to start with a fresh admin panel. Do it **before step 6**, at a quiet hour.

```bash
sudo apt-get update -qq && sudo apt-get install -y -qq postgresql-common && sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y && sudo apt-get install -y -qq postgresql-client-17
pg_dump "PASTE_RENDER_EXTERNAL_DATABASE_URL" --no-owner --no-acl -f ~/rosier.sql
gcloud sql connect rosier-db --user=postgres --database=rosier_app
```

Enter the database password. At the `rosier_app=>` prompt type `\i ~/rosier.sql`, press
Enter, wait for it to finish, then type `\q`.

## 5. Settings

```bash
cp env.example.yaml ~/env.yaml
nano ~/env.yaml
```

Fill in every value. Save with **Ctrl+O, Enter, Ctrl+X**. The file stays in your Cloud
Shell. Don't put it on GitHub.

- `DATABASE_URL`: your database password and project ID.
- `JWT_SECRET`: run `openssl rand -hex 32` for a new one. Moving from Render? Use Render's
  value so customers stay logged in.
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`: your first admin login.

## 6. Put it live

```bash
bash deploy-gcloud.sh
```

The first time it asks to create a repository. Answer **Y**. After 5–10 minutes it prints
your address, like `https://rosier-api-xxxxx.asia-south1.run.app`.

Check in a browser:

- `…/healthz`, which should show `"db":"postgres"`
- `…/admin` (log in)
- `…/privacy`, `…/terms` and `…/delete-account`, which are the links for the Play Store and App Store

## 7. Connect everything

1. **Shopify admin → Customer Account API (Headless) settings:** add the callback URL with
   the new address. Copy the path from the existing one.
2. **Admin panel:**
   - check the Shopify keys
   - Phone notifications → paste the Firebase key → **Send test**
   - Privacy, terms & account deletion → fill in the company, grievance officer and policy links
3. **The app:** in `app.json`, set `"apiUrl"` to the new address. You can edit it on GitHub
   (open the file → pencil icon → Commit). Then build the store versions.
4. Keep Render running until the new app version is live in the stores, then cancel it.

## Updating the server later

In Cloud Shell: `cd rosier-app && git pull && cd server && bash deploy-gcloud.sh`.
Updates go live with no downtime.

## Good to know

- The server keeps **1 copy always running** and adds up to **3** when busy. To allow more,
  run `MAX_INSTANCES=5 bash deploy-gcloud.sh`. The code is safe with several copies: order
  notifications are sent once, and the order check runs on one copy at a time.
- Logs: Cloud Run → `rosier-api` → **Logs**.
- Backups: Cloud SQL → `rosier-db` → **Backups**. Daily backups are kept for 7 days.
- Your own domain (e.g. `api.rosierfoods.com`): Cloud Run → **Manage custom domains**. If
  Mumbai doesn't offer it, a Google load balancer is needed (about $18 a month).
