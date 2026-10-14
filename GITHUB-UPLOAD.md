# Put this project on GitHub (no coding needed)

The website's drag-and-drop upload only takes 100 files at a time, and this project has more.
Use **GitHub Desktop** instead. It's a free app that uploads the whole folder in one go.

## 1. Create the account and the repository

1. Sign up at **github.com** with the company app email. Turn on **two-factor
   authentication** (Settings → Password and authentication).
2. Click **+ → New repository**:
   - Name: `rosier-app`
   - Choose **Private**, so the code isn't public
   - Don't tick "Add a README"
   - **Create repository**

## 2. Upload with GitHub Desktop

1. Install **GitHub Desktop** from desktop.github.com and sign in with the new account.
2. Unzip `Rosier-app-with-admin.zip`. You get a folder called `Rosier-app-main`.
3. In GitHub Desktop: **File → Add local repository →** choose `Rosier-app-main`.
   - If it says "this directory does not appear to be a Git repository", click
     **create a repository** → keep the name → **Create repository**.
4. **Publish repository** → tick **Keep this code private** → choose your account → **Publish**.

That's it: all files are on GitHub. Later changes: open GitHub Desktop, write a short
summary at the bottom left, click **Commit to main**, then **Push origin**.

## 3. Add the secrets the build buttons need

GitHub → your repository → **Settings → Secrets and variables → Actions → New repository secret**:

| Name | What to paste |
| --- | --- |
| `EXPO_TOKEN` | expo.dev → Account settings → **Access tokens** → Create |
| `GOOGLE_SERVICES_JSON` | The whole contents of `google-services.json` from Firebase (Android app `com.rosierfoods.app`) |

Secrets are hidden; nobody can read them back, not even you.

## 4. Build the store apps

**Actions** tab → choose a workflow → **Run workflow**:

- **Build Android for Play Store**: makes the `.aab` file to upload to Play Console.
- **Build iOS**: makes the iPhone build. Run it once from your laptop first
  (`npx eas-cli@latest build -p ios`) so EAS can set up Apple certificates.
- **Build Android APK**: a test file to install directly on Android phones.

When a run finishes, the file is under **Artifacts** at the bottom of the run page.

## Never put these on GitHub

- `google-services.json`, Firebase service-account keys, and `.pem` files
- `env.yaml` (the server settings with passwords)
- Shopify tokens or database passwords

The project's `.gitignore` already skips these. Keys like Shopify and Firebase go into the
**admin panel**, where they're stored on the server and hidden.
