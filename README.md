# Autrob PG Manager

A local PG and hostel operations app with a responsive owner dashboard, login, and SQLite-backed records.

## Run it locally

1. From this folder, run `npm install` once.
2. Run `npm run build`.
3. Run `npm start`.
4. Open `http://127.0.0.1:3000/`.

`npm run dev` starts the API and Vite together when developing with the Vite dev server.

## Windows desktop app (development build)

The Windows shell runs the existing React interface in Electron and starts the local Express service automatically. Business data and sessions live under the current Windows user's Electron application data folder; they are not stored in Program Files. The shell listens only on `127.0.0.1:4174`, enforces one desktop instance, and writes startup diagnostics under the app's `logs` folder.

Run `npm run dev:desktop` for development, `npm run desktop:pack` for an unpacked Windows x64 build, or `npm run desktop:dist` to create `release/Autrob-PG-Manager-Setup-1.0.0.exe`. The installer creates Start Menu and Desktop shortcuts and leaves app data in place on uninstall. The setup executable should be Authenticode-signed by Autrob before public distribution; no signing certificate or update host is configured here.

On first desktop launch, the app creates a random owner password and displays it once. Save it securely and change it after signing in. The Backup screen offers integrity-checked backups, a daily 2:00 AM automatic backup while the app is running, an optional external backup folder, and a restore flow that validates the selected database and creates a safety backup first. Desktop startup does not move or modify the old project `data` folder; use Restore to import an existing database copy.

The platform administration console includes tenant, subscription, SaaS payment, and license management. Platform admins can issue a license from **Manage → Licences**; an owner activates its key from the owner app's **Settings → Plan & billing** area. SaaS payments are recorded manually; no payment gateway is connected.

## First login

- Email: `owner@nivasbook.local`
- Password: `Nivasbook@2026`

Change the password in **Settings → Change password**. On a fresh database, you may set `NIVASBOOK_OWNER_PASSWORD` before starting the server to choose the initial password. Set `NIVASBOOK_SESSION_SECRET` to a private random value for longer use. The app server binds to `127.0.0.1` and is intended for local use.

The **Settings** admin area saves owner identity, PG business name/address, UPI and bank collection details, and provides manager login creation and password resets. Manager accounts use their email as the login ID; passwords are hashed. Only owner accounts can access account and payment setup administration. Use **Payment setup** to view the locally recorded payment ledger.

## Nivasbook platform administration

Open `http://127.0.0.1:3000/platform` for the separate Nivasbook staff console. The initial local platform admin is `platform@nivasbook.local` with password `NivasAdmin@2026`. For a hosted deployment, set `NIVASBOOK_PLATFORM_EMAIL`, `NIVASBOOK_PLATFORM_PASSWORD`, `NIVASBOOK_OWNER_EMAIL`, `NIVASBOOK_OWNER_PASSWORD`, and `NIVASBOOK_SESSION_SECRET` to private values before the first server start.

The platform console registers PG workspaces, assigns owner login IDs and initial passwords, resets owner passwords, tracks trial and subscription status, and records SaaS receipts with billing periods, methods, and references. A recorded successful payment activates the workspace and saves its next billing date. SaaS records are manual payment reconciliation; a payment gateway or automatic card/UPI collection is not connected. Suspended or cancelled tenants and expired trials cannot sign in.

## Data

The first run creates `data/nivasbook.sqlite` and adds example properties, residents, payments, and expenses. New residents, properties, enquiries, payments, and expenses are saved in this database and remain after a reload. The seeded records are sample data; replace them with your own records. Back up the `data` folder to preserve the local workspace.

## Deploy to Render

1. Push this project to a GitHub repository you control.
2. In Render, choose **New → Blueprint**, connect that repository, and apply the checked-in `render.yaml`.
3. Render prompts for the four `sync: false` values. Set the owner account email/password and separate platform-admin email/password. Keep both passwords and the generated session secret private.
4. Complete the first deploy, then open the service URL and append `/platform` to reach platform license administration.

The Blueprint attaches a paid persistent disk at `/var/data` because SQLite stores owner accounts, business records, sessions, and license activations. Keep this as a single service instance: Render disks are single-instance, and data outside the mounted directory is ephemeral. `/api/health` is configured as the deploy health check. Back up the workspace database regularly; do not remove or replace the disk when updating the service. The service uses the Render-provided HTTPS endpoint; custom domain and DNS setup are optional.

### Free Render license test (disposable)

Use `render.free-test.yaml` as the Blueprint path to test a Windows activation key without adding a payment method. This separate Blueprint omits the persistent disk and uses `/tmp/nivasbook-data`; Render may erase its SQLite database when the free service spins down, restarts, or redeploys. Use test accounts and test licenses only. Do not enter real resident or owner data. Set the four owner/platform-admin secrets during Blueprint setup, then visit `/platform` to register a test owner and issue a license key. The desktop package forwards activation requests to `https://nivasbook-license-test.onrender.com`; only package a test build after that service is live. The free test API accepts high-entropy, single-use issued license keys and enforces the plan's device limit.

Some parts of the owner interface remain previews: electricity reading allocation, maintenance tickets, staff, messaging, and reminders do not yet write to the database. Property room counts and bed capacities are stored, and room numbers and bed slots can be added, edited, and deleted from Rooms & beds. Manager accounts currently share workspace data permissions; fine-grained role permissions, external WhatsApp/email, and remote backups are not implemented.

