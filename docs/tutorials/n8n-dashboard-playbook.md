# Serve the ledger dashboard from n8n

This playbook supports the BAT1-22 review on November 18, 2026. The dashboard is served by the existing local n8n container. The browser reads the running AITS API directly.

## Open the dashboard

Open [Ledger Dashboard](http://localhost:5678/webhook/ledger). Click **Connect AITS** and enter the service key for the running AITS instance. The key stays in memory until the tab reloads or disconnects. Select a run to inspect its lineage, then open **Ledger audit** and click **Run full audit**.

The **Github issue triage** workflow includes an **Open Ledger Dashboard** Sticky Note. After an execution, **Record AITS Ledger** returns `ledger.dashboardUrl`, which opens that execution's root. The recorder's **Dashboard URL** setting controls the serving URL.

## Build and deploy

From the AITS checkout root in Git Bash, run the following commands. Docker Desktop, Node.js, the existing `n8n` container, and a running AITS instance are required.

```bash
cd tools/ledger-dashboard
npm ci
npm run build
cd ../..
MSYS2_ARG_CONV_EXCL='*' docker exec n8n mkdir -p /home/node/.n8n-files/ledger-dashboard
MSYS2_ARG_CONV_EXCL='*' docker cp tools/ledger-dashboard/dist/index.html n8n:/home/node/.n8n-files/ledger-dashboard/index.html
```

The build creates `tools/ledger-dashboard/dist/index.html`. Rebuild and copy it after dashboard changes. The current container uses a copied file under `/home/node/.n8n-files`, n8n's default permitted file directory. Repeat the copy if that container is recreated. The all-in-one lab Compose configuration mounts the built directory read-only at the same path.

Import `docs/tutorials/n8n-ledger-lab/ledger-dashboard.json` through n8n's **Import from File** menu and publish the workflow. It contains **Open ledger → Read dashboard HTML → Serve dashboard**. The webhook accepts GET at `ledger`, the file reader produces binary `data`, and the response sends HTML inline with `Cache-Control: no-store`.

For CLI installation into the existing local container, run these commands from the checkout root.

```bash
MSYS2_ARG_CONV_EXCL='*' docker cp docs/tutorials/n8n-ledger-lab/ledger-dashboard.json n8n:/tmp/ledger-dashboard-workflow.json
MSYS2_ARG_CONV_EXCL='*' docker exec n8n n8n import:workflow --input=/tmp/ledger-dashboard-workflow.json
MSYS2_ARG_CONV_EXCL='*' docker exec n8n n8n publish:workflow --id=aitsLedgerDashboard
docker restart n8n
```

The restart applies the published webhook after CLI import and reloads custom node changes. Reinstall the updated custom recorder using the instructions in [Your first n8n ledger](your-first-n8n-ledger.md#install-the-local-node).

## Configure API access

For the current local demo, AITS runs at `http://127.0.0.1:8000`. Set the following value in the AITS checkout's `.env.local` and restart AITS after configuration changes.

```dotenv
CORS_ORIGINS=["http://localhost:5678","http://127.0.0.1:5678","null"]
```

The `null` origin permits reads from local files and n8n's sandboxed HTML. Service authentication still applies. GET and Authorization preflights are permitted. Add the actual n8n origin if its host or port changes. Both local origin preflights and live authenticated dashboard requests were verified.

To target a hosted AITS API, set `AITS_API_URL=https://your-aits-host.example` in `tools/ledger-dashboard/.env.local`, rebuild, and recopy the file. Use the origin without a path or embedded credentials. Configure CORS on that API for the serving origin and n8n's sandbox origin. Production and preview builds use the API URL directly. Development uses Vite's read-only proxy.

The self-contained HTML can also be opened from disk. Direct `file://` browser testing was blocked by the verification browser's URL policy. Its embedded assets and the identical build served through n8n were verified.

## Repeat the end-to-end check

1. Execute **Github issue triage** from **Manual Trigger**, using the included synthetic issue and the configured OpenAI and AITS credentials.
2. Check **Record AITS Ledger** for `verified: true` and copy `ledger.dashboardUrl`.
3. Open that URL in a fresh tab. Connect with the AITS service key and confirm the matching execution ID, decision, model call, and lineage.
4. Open **Ledger audit** and run the full audit.

The November 17 check executed workflow `UXmu2AR3S1i4ONtx` through n8n's CLI using a separate task-broker port because the running editor already owned port 5679. Execution **11** completed successfully with decision **allow** and `verified: true`. The fresh browser tab showed that execution and its five steps. The full audit passed with **39 records and 44 ledger entries** checked.

The verified root is `72f26b41186623f46d85e6513d6e2e4e70e608615f8f13071548ae6861bb4dce`. The terminal decision CID is `211d0ce012e627b87bef8852fac1c1c3fe734289e4f22fb8c62e731f240adaac`.

Automated verification passed 393 tests using a separate PostgreSQL test database. The Unix-only hook tests fail to import `fcntl` on Windows and were excluded from that successful run. SDK integration tests were skipped because the generated SDK is absent. Single-file asset checks, CORS preflights, rejected unconfigured origins, service authentication, Python formatting, and the custom node's JavaScript syntax were also checked. The npm audit reports five high-severity development dependency findings through picomatch. The production dependency audit reports zero findings.

## Grant's review

Share the dashboard URL together with this playbook and the [trace mapping note](n8n-trace-mapping.md). The current URL and API are local to Matt's computer. Grant needs a reachable n8n host and AITS API to use them from his own computer. A `localhost` URL on Grant's computer refers to Grant's computer. Remote review remains dependent on a reachable hosted deployment and the public-image work described in the sprint guide.

Suggested handoff text follows.

> Grant, the ledger dashboard is available in the local n8n demo at http://localhost:5678/webhook/ledger. The triage workflow links to it from its Sticky Note and recorder output. The November 17 check recorded execution 11, verified its lineage, and passed the ledger audit. The accompanying playbook explains how to repeat the check, and the mapping note explains the execution graph and model-call records. Both n8n and AITS currently run on my computer. Independent testing from your computer needs reachable hosted URLs. For the November 18 review, please record your go or no-go on the mapping, what worked or failed in onboarding, and changes needed before November 27.

Grant's delivery destination and review feedback are pending. Record his actual feedback in BAT1-22 after the review.
