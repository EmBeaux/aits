# Your first n8n ledger

Set up AITS, PostgreSQL, and n8n, run the supplied issue-triage workflow, and inspect its
recorded model call and decision in Ledger Explorer. A second n8n workflow serves the
React dashboard at a published webhook URL. Opening that page loads live data
automatically through the AITS credential saved in n8n, including after a page reload.

## Choose a setup

Both paths provide the same issue-triage demo and Ledger Explorer on Windows and macOS.
**Choose one setup path. You do not need to complete the manual setup after starting
the Docker lab.**

| Setup path | Best for | What you manage |
| --- | --- | --- |
| **One-command Docker lab (recommended)** | Grant demos, onboarding, and trying AITS | Docker builds and connects the services, installs the custom node, configures the AITS credential, imports the workflows, and publishes the dashboard. |
| **Manual development setup** | Learning how the components connect, developing AITS, and troubleshooting individual services | Install local development tools, run AITS on your computer, and configure the Docker services, custom node, dashboard, credentials, and workflows individually. |

The lab requires Docker Desktop and this source checkout; Python, uv, and Node.js run
inside the containers. From the checkout root, run:

```shell
docker compose -f docs/tutorials/n8n-ledger-lab/compose.yaml up --build -d --wait
```

Open [n8n](http://localhost:5679), create your owner account, and select your OpenAI
credential in **Triage model** in the imported **Issue triage ledger demo** workflow.
Execute the workflow, then open [Ledger Explorer](http://localhost:5679/webhook/ledger).
The custom node, AITS credential, and published dashboard are configured automatically.

For lab configuration, updates, and stop commands, continue to
[Run the all-in-one Docker lab](#run-the-all-in-one-docker-lab). After recording a run,
use [section 8](#8-inspect-the-new-run-and-audit-the-ledger) to inspect and verify it.

## Manual development setup

Follow the prerequisites and steps 1–7 below if you want to set up each component
yourself. AITS runs on your computer, while PostgreSQL and n8n run in Docker. Running
AITS locally lets you edit its Python code and reload the service without rebuilding
a Docker image. The individual setup steps also show where each connection and
credential is configured.

This path uses separate ports and data from the Docker lab. If you chose the lab,
skip these installation and configuration steps; section 8's inspection and audit
instructions apply to either setup.

### Before you start

Install Git, Docker Desktop, Node.js 22.12+ with npm, and uv. On Windows, configure Docker
Desktop for Linux containers. Start Docker Desktop before running these commands.
uv installs the Python version used by this checkout. Installation instructions are
available from the vendors. [Git](https://git-scm.com/downloads),
[Docker Desktop](https://docs.docker.com/desktop/),
[Node.js](https://nodejs.org/en/download),
[uv](https://docs.astral.sh/uv/getting-started/installation/).

You also need an OpenAI API key with access to the model selected in **Triage model**.
The workflow import selects `gpt-4.1-mini`. Executing triage makes a model request using
your OpenAI account.

Obtain the AITS source checkout or source archive containing this tutorial. The
development branch used for this work is `bat1-22_custom-n8n-aits-node`. The repository
owner needs to provide that source when distributing this walkthrough. Check that it
contains the following files.

| File or directory | Purpose |
| --- | --- |
| `docker-compose.yml` | Local PostgreSQL service |
| `docs/tutorials/n8n-ledger-lab/custom/AitsLedger.node.js` | Record AITS Ledger node |
| `docs/tutorials/n8n-ledger-lab/custom/AitsApi.credentials.js` | AITS API credential type |
| `docs/tutorials/n8n-ledger-lab/issue-triage.json` | Issue-triage workflow |
| `docs/tutorials/n8n-ledger-lab/ledger-dashboard.json` | Dashboard serving workflow |
| `tools/ledger-dashboard` | React dashboard and single-file build |

Open PowerShell on Windows or Terminal on macOS in the checkout root. For a checkout
placed in your home directory, run the following commands. On Windows, use `npm.cmd`
wherever the shared examples show `npm`.

```shell
cd ~/aits
git --version
docker version
docker compose version
node --version
npm --version
uv --version
```

The recorder was checked with n8n **2.47.5**. It reads n8n's model sub-node execution data,
so use that version for this walkthrough and recheck recording when upgrading n8n.

| Client | Address it uses in the main walkthrough |
| --- | --- |
| Browser opening n8n | `http://localhost:5678` |
| Browser opening Ledger Explorer | `http://localhost:5678/webhook/ledger` |
| Webhook dashboard reading live data through n8n | `http://localhost:5678/webhook/ledger-api` |
| Host process or standalone dashboard calling AITS | `http://127.0.0.1:8000` |
| n8n container calling host-run AITS | `http://host.docker.internal:8000` |
| Host-run AITS connecting to PostgreSQL | `127.0.0.1:15432` |

Shared command blocks work in PowerShell and the default macOS shell. Platform-specific
examples are labeled. Paths inside Docker use Linux syntax on both operating systems.
Use your editor, File Explorer on Windows, or Finder on macOS to create the configuration
files below. Save their exact names, including the leading dot in `.env.local`.

## 1. Install AITS and configure authentication

From the checkout root, install Python and the locked Python dependencies.

```shell
uv python install 3.13
uv sync --frozen
```

Generate a service key and keep the result for the AITS configuration and saved n8n
credential. The webhook dashboard uses that credential automatically.

```shell
uv run --frozen python -c "import secrets; print(secrets.token_hex(32))"
```

Create `.env.local` in the checkout root with these settings. Replace
`replace-with-your-generated-key` with the generated key. If `.env.local` already exists,
edit the matching settings in that file.

```dotenv
POSTGRES_USER=bastion
POSTGRES_PASSWORD=bastion
POSTGRES_DB=bastion
POSTGRES_PORT=15432
DATABASE_URL=postgresql+psycopg://bastion:bastion@127.0.0.1:15432/bastion
AUTH_DISABLED=false
AUTH_SERVICE_KEYS=n8n-tutorial:replace-with-your-generated-key
CORS_ORIGINS=["http://localhost:5678","http://127.0.0.1:5678","null"]
```

The service-key value has the form `name:secret`. Enter the `secret` portion once in
the n8n credential configured in section 6. With multiple entries in `AUTH_SERVICE_KEYS`,
choose the secret for the intended n8n caller. AITS loads `.env`, then `.env.local`, with
shell environment variables taking precedence. The settings above explicitly enable
service authentication.

`CORS_ORIGINS` supports browser-to-AITS requests from standalone and preview dashboard
modes. Local files can send the origin `null`, so that value is included alongside the
local origins. The production webhook dashboard sends reads to n8n, which authenticates
its requests to AITS with the saved credential. Restart AITS after configuration changes.
[Configuration and authentication](../reference/configuration.md).

## 2. Start PostgreSQL, then AITS

Start PostgreSQL and wait for its health check before starting the API.

```shell
docker compose --env-file .env.local -p aits-tutorial up -d --wait postgres
docker compose --env-file .env.local -p aits-tutorial ps
```

The service is named `postgres`, its container is `bastion-one-postgres`, and its host
port is `15432`. If that container already belongs to your running AITS setup, use the
existing setup with its matching database settings. The project name above produces
the `aits-tutorial_bastion_pg_data` volume for a fresh installation.

Start the AITS development server in this terminal.

```shell
uv run --frozen fastapi dev --host 0.0.0.0 --port 8000
```

Binding to `0.0.0.0` lets Docker Desktop reach the API through `host.docker.internal`.
Keep this terminal running. Wait for **Application startup complete**, then check for
`{"status":"ready"}` at the readiness URL. [AITS readiness](http://127.0.0.1:8000/ready).

Open a second terminal in the same checkout for the remaining commands. On Windows,
you can also check readiness from PowerShell.

```powershell
Invoke-RestMethod http://127.0.0.1:8000/ready
```

On macOS, use the following command.

```shell
curl --fail http://127.0.0.1:8000/ready
```

The API documentation is available while AITS is running.
[AITS API documentation](http://127.0.0.1:8000/docs).

## 3. Start n8n

If you already have n8n running locally, identify its container and use that container's
name in the remaining commands.

```shell
docker ps -a --format '{{.Names}}  {{.Status}}  {{.Ports}}'
```

For a fresh installation, create its data volume and start n8n. This command uses the
container name `n8n` throughout the rest of the walkthrough.

Create the volume on either platform.

```shell
docker volume create n8n_data
```

On Windows, start the container from PowerShell.

```powershell
docker run -d `
  --name n8n `
  --restart unless-stopped `
  -p 127.0.0.1:5678:5678 `
  -e N8N_SECURE_COOKIE=false `
  -e N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true `
  -e EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=true `
  -e EXECUTIONS_DATA_SAVE_ON_SUCCESS=all `
  -v n8n_data:/home/node/.n8n `
  docker.n8n.io/n8nio/n8n:2.47.5
```

On macOS, start the container from Terminal.

```shell
docker run -d \
  --name n8n \
  --restart unless-stopped \
  -p 127.0.0.1:5678:5678 \
  -e N8N_SECURE_COOKIE=false \
  -e N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true \
  -e EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=true \
  -e EXECUTIONS_DATA_SAVE_ON_SUCCESS=all \
  -v n8n_data:/home/node/.n8n \
  docker.n8n.io/n8nio/n8n:2.47.5
```

The loopback port and cookie setting support this local HTTP setup. n8n stores its
workflows, credentials, and encryption configuration in `n8n_data`.
[n8n Docker installation](https://docs.n8n.io/hosting/installation/docker/).

Open n8n and complete its initial owner-account setup if prompted. An existing container
can be started with `docker start n8n`. Wait for the editor to load before continuing.
[Local n8n](http://localhost:5678).

## 4. Install the local node and credential type

From the checkout root, create the custom directory and copy both supplied JavaScript
files into the container.

```shell
docker exec n8n mkdir -p /home/node/.n8n/custom
docker cp docs/tutorials/n8n-ledger-lab/custom/AitsLedger.node.js n8n:/home/node/.n8n/custom/AitsLedger.node.js
docker cp docs/tutorials/n8n-ledger-lab/custom/AitsApi.credentials.js n8n:/home/node/.n8n/custom/AitsApi.credentials.js
docker restart n8n
```

After n8n restarts, refresh the editor. The first file adds **Record AITS Ledger**. The
second adds the **AITS API** credential type. Docker Desktop's container **Files** view
shows the copied files under `/home/node/.n8n/custom`.

The dashboard file uses a separate directory, `/home/node/.n8n-files/ledger-dashboard`.
The following steps create that directory and populate it after the dashboard build.

## 5. Build the dashboard and copy it into n8n

Create `tools/ledger-dashboard/.env.local` with the API origin used by your browser.
This file belongs to the dashboard directory, separate from the root AITS configuration.

```dotenv
AITS_API_URL=http://127.0.0.1:8000
```

Build the dashboard from the checkout root.

```shell
cd tools/ledger-dashboard
npm ci
npm run build
cd ../..
```

Vite and `vite-plugin-singlefile` produce `tools/ledger-dashboard/dist/index.html` with
the JavaScript, CSS, and fonts embedded. Copy it to the serving workflow's directory.

```shell
docker exec n8n mkdir -p /home/node/.n8n-files/ledger-dashboard
docker cp tools/ledger-dashboard/dist/index.html n8n:/home/node/.n8n-files/ledger-dashboard/index.html
docker exec n8n ls -lh /home/node/.n8n-files/ledger-dashboard/index.html
```

n8n 2.x permits file nodes to read `~/.n8n-files` by default. For this container that path
is `/home/node/.n8n-files`. If your existing instance has a custom file allowlist, include
the dashboard directory in it. The file reader uses the Linux container path above.
[Read/Write Files from Disk](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.readwritefile/).

The API origin is embedded for standalone and preview connections. At the production
webhook URL, the dashboard automatically uses n8n's credential-backed read route.

## 6. Import and publish the dashboard workflow

1. Create a new workflow in n8n and choose **Import from File**.
2. Select `docs/tutorials/n8n-ledger-lab/ledger-dashboard.json` from your checkout.
3. Open **Read AITS** and create or select an **AITS API** credential. Set its **Server
   URL** to `http://host.docker.internal:8000` and **Service Key** to the secret from
   section 1. The **Read AITS** node's URL expression also uses this origin, followed
   by `$json.query.path`. Save the credential and workflow.
4. Publish it using **Publish**. Versions with an **Active** toggle use that toggle to
   enable the production webhook.
5. Open the production dashboard URL in a fresh browser tab.

For the primary setup, the **Read AITS** URL expression is shown below. Configure it
once along with the selected credential. The expression appends the validated ledger
path to the server origin.

```text
={{ 'http://host.docker.internal:8000' + $json.query.path }}
```

[Ledger Dashboard](http://localhost:5678/webhook/ledger).

The imported workflow contains these nodes and settings.

| Node | Settings |
| --- | --- |
| Open ledger | Webhook, GET, path `ledger`, respond using the Respond to Webhook node |
| Read dashboard HTML | Read/Write Files from Disk, read `/home/node/.n8n-files/ledger-dashboard/index.html`, binary field `data`, MIME type `text/html` |
| Serve dashboard | Respond to Webhook, binary file from field `data`, `Content-Type: text/html; charset=utf-8`, `Content-Disposition: inline`, `Cache-Control: no-store` |
| Open ledger API | GET webhook at `ledger-api`, responding through Respond ledger data |
| Validate ledger read | IF node checking the request path's format |
| Allowed ledger read | IF node with one visible condition for each permitted ledger endpoint |
| Read AITS | GET the validated path with the saved AITS API credential |
| Respond ledger data | Return the API JSON and status, with no-store caching and the sandbox CORS origin |
| Reject ledger read | Return HTTP 404 when either path check fails |

Both validation nodes use n8n's built-in IF conditions. Open **Allowed ledger read** to
view or edit the permitted endpoints individually. Paths containing a CID use a
64-character hexadecimal match. The workflow JSON stores these conditions directly.

The production URL uses `/webhook/ledger`. The `/webhook-test/ledger` URL works while the
editor is listening for a test. Publishing enables the production URL independently of
an editor execution. Use the production URL for automatic live-data connections.

The webhook page automatically shows live runs and **Connected to AITS**, including
after a reload or in a fresh tab. A fresh ledger has an empty run list until you execute
triage. Once the n8n credential is configured, opening the dashboard requires no key
entry. The service key stays in n8n's saved credential and is attached to AITS requests
on the server.

The browser requests `/webhook/ledger-api`, which permits the dashboard's ledger GET
endpoints. Unsupported paths and write requests are rejected. The response contains the
requested ledger data, and the served HTML contains no service key.

These dashboard webhooks grant read access to visitors who can reach them. Configure
their access for the intended audience when hosting them.

n8n sandboxes webhook HTML. The dashboard uses an absolute URL for its read-only n8n
API webhook, whose response permits the sandbox origin.
[Respond to Webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/).

## 7. Import, configure, and execute the triage workflow

Create another workflow and import `docs/tutorials/n8n-ledger-lab/issue-triage.json`.
Its name is **Issue triage ledger demo**. **Triage model** and **Fixture lookup** are
sub-nodes attached to **Triage agent**. The main path is shown below.

```text
Manual Trigger → Prepare issue → Triage agent → Check proposal → Record AITS Ledger
```

1. Open **Record AITS Ledger** and select the **AITS API** credential saved in section 6.
2. Set the recorder's **Dashboard URL** to `http://localhost:5678/webhook/ledger`.
3. Open **Triage model**, create or select an OpenAI credential, and enter your OpenAI
   API key. Select the fixed model `gpt-4.1-mini`, or a text model your account can access.
4. Save the workflow, clear any pinned execution data, and click **Execute workflow** to
   run the full path from **Manual Trigger**.

The import includes an **Open Ledger Dashboard** Sticky Note with the production URL.
If you use another n8n host or port, update both the note and **Dashboard URL**.

**Prepare issue** contains a synthetic bug report. A GitHub credential is needed when
extending the workflow with a GitHub trigger that reads real issues. The supplied manual
workflow uses its fixture directly. The ledger retains the model input and output.

Keep the supplied node names, fixed model selection, and fixed system prompt for this
walkthrough. The recorder expects exactly one execution of each named node, one text
model generation, and zero executed tool calls. The fixture tool remains attached as
part of the recorded configuration. [n8n trace mapping](n8n-trace-mapping.md).

Open **Record AITS Ledger** after execution. Its JSON output includes the decision and
these `ledger` fields.

| Field | Meaning |
| --- | --- |
| `workflowId`, `executionId` | Identify the n8n workflow and this execution |
| `configCid` | Stored prompt, model settings, and declared tools |
| `dutCid` | The actual model call's recorded input and output |
| `rootCid` | Root of this execution's lineage graph |
| `decisionCid` | Terminal step containing the policy decision |
| `verified` | `true` after AITS verifies the terminal lineage |
| `dashboardUrl` | Dashboard link ending in `#root/<rootCid>` for this execution |

The synthetic report normally produces `allow` with `reproduction_present`. A `review`
decision is also a workflow outcome, including when the model response cannot be parsed
as JSON. Read `reason` and the recorded output to understand the result. Record integrity
is reported by `verified` and the full audit.

## 8. Inspect the new run and audit the ledger

1. Copy `ledger.dashboardUrl` from the recorder output and open it in a fresh tab.
2. Confirm live data loads automatically through the saved server connection.
3. Confirm the selected run's execution ID matches the n8n output.
4. Follow **Run started**, **Prepare issue**, **Triage agent**, **Triage model**, and
   **Check proposal**. Open the model call to inspect **Output**, **Input**, and
   **Configuration**.
5. Select **Verify record** in a step or call inspector and check for **Record verified**.
6. Open **Ledger audit**, click **Run full audit**, and check for **Audit passed**.

Use the run browser to search by workflow, issue key, or CID. **Run start** supports
relative dates and a custom range in your local timezone. **More filters** includes
workflow name or ID, business key, and recorded decision. **Sort runs** can show newest
starts or latest activity. **Load more runs** pages through history, and **Refresh runs**
picks up new executions in an already open tab.

On larger screens, drag the canvas to pan, scroll to zoom, or use **Fit graph**. **Step
list** shows the same steps as a list. **Trace inputs** follows the inputs behind a
decision. Evidence links open referenced steps from other runs when such links exist.
Inspectors show when an event happened and when AITS first recorded it.

**Open by CID** opens a run, step, or recorded call directly. The selection is preserved
in the URL, and the inspector can copy a link to it.

The live local check recorded execution **11** on November 17, 2026. Its recorder returned
`verified: true`, a fresh dashboard tab showed the matching five-step run, and the full
audit passed for 39 records and 44 ledger entries. Counts increase as you record more
executions. The audit API returns `valid: true` and an empty `failures` list for success.

## Read the API through an n8n HTTP Request node

Create a workflow with **Manual Trigger → HTTP Request**. Set the method to GET and
choose **Predefined Credential Type → AITS API** with your saved credential. You can
also use **Generic Credential Type → Header Auth**, with header name `Authorization`
and value `Bearer <your service key>`.

Use these URLs for the primary setup. Replace CID placeholders with recorder output.

| Query | URL |
| --- | --- |
| Run search | `http://host.docker.internal:8000/lineage/runs/?limit=24` |
| Lineage roots | `http://host.docker.internal:8000/lineage/` |
| Run graph and summary | `http://host.docker.internal:8000/lineage/<rootCid>/?include_run=true` |
| Recorded model call | `http://host.docker.internal:8000/duts/<dutCid>/` |
| Verify the decision lineage | `http://host.docker.internal:8000/verify/<decisionCid>/` |
| Full audit | `http://host.docker.internal:8000/audit/` |

Execute the request and inspect its JSON or Table output. The API references describe
the other queries and verification properties.
[Lineage API](../reference/lineage.md), [verification API](../reference/verification.md).

## Restart, update, and keep your data

For a later session, start Docker Desktop, return to the checkout root, and run these
commands. The API command occupies its terminal while it runs.

```shell
docker compose --env-file .env.local -p aits-tutorial up -d --wait postgres
docker start n8n
uv run --frozen fastapi dev --host 0.0.0.0 --port 8000
```

AITS writes to the `bastion` PostgreSQL database. The `dut` table holds model calls,
`lineage_tag` holds workflow steps, and `commit_log` holds ledger entries. The PostgreSQL
volume persists across container restarts. n8n's workflows and credentials persist in
`n8n_data`. Preserve these volumes when keeping evidence or saved credentials. Back up
the database and n8n data before changing or recreating the setup.

After editing dashboard `.jsx`, `.js`, or CSS files, rebuild and copy the HTML from the
checkout root.

```shell
cd tools/ledger-dashboard
npm run build
cd ../..
docker exec n8n mkdir -p /home/node/.n8n-files/ledger-dashboard
docker cp tools/ledger-dashboard/dist/index.html n8n:/home/node/.n8n-files/ledger-dashboard/index.html
```

Reload the dashboard. The webhook reconnects automatically. The workflow reads HTML on each
request. For the primary `docker run` setup, the dashboard directory lives in the
container's writable layer. Repeat the copy when recreating that container. The custom
directory resides in the persistent n8n volume.

After changing the custom node or credential JavaScript, repeat the two copy commands
from section 4 and restart n8n. Refresh the editor after the restart. Reimport workflow
JSON when you want changes from its supplied template, then check credential selections.

To stop a local session, press Ctrl+C in the AITS terminal and use these commands.

```shell
docker stop n8n
docker compose --env-file .env.local -p aits-tutorial stop postgres
```

### Rotate the AITS service key

The saved n8n credential contains a copy of the secret configured in `AUTH_SERVICE_KEYS`.
When rotating that key, update `AUTH_SERVICE_KEYS`, restart AITS, and update **Service
Key** in the saved **AITS API** credential. Both **Read AITS** and **Record AITS Ledger**
use that saved credential. Reload the dashboard to verify that live runs load again.
Future page loads use the updated server connection automatically.

## Dashboard development and other API hosts

For a dashboard development session, run `npm run dev` from `tools/ledger-dashboard`.
Vite's read-only proxy forwards API reads, and the dashboard refreshes as you edit it.
The Windows **Open Dashboard.cmd** launcher provides the same local development flow.
On macOS, use `npm run dev` from Terminal in that directory.
[Dashboard development server](http://127.0.0.1:4173).

The single HTML build also contains the assets needed for opening `dist/index.html`
directly in a browser. Connect with the service key. The `null` CORS origin supports API
reads from that file context.

For the automatic webhook connection, update **Read AITS** to use the new API origin
and its saved AITS credential. The URL expression appends `$json.query.path` to that origin.
For standalone, preview, or development connections, change `AITS_API_URL` in the
dashboard's `.env.local`, rebuild, and copy the HTML. Use an HTTP(S) origin without a
path or embedded credentials and configure browser-to-AITS CORS for those modes.

When sharing the webhook dashboard, its URL must be reachable from the other person's
computer, and n8n must be able to reach AITS. A `localhost` URL points to the computer
opening it. The local setup can be reproduced given the source, credentials, and
dependencies above. Remote review needs reachable hosted URLs.

## Run the all-in-one Docker lab

Use this path for the grant demo, onboarding, or trying AITS with minimal setup. It
automates the installation and configuration covered by manual steps 1–7. You only
need to create your n8n owner account and configure OpenAI once, as described below.
For frequent changes to AITS Python code, the
[manual development setup](#manual-development-setup) lets you reload the local service
without rebuilding its image.

Install and start Docker Desktop, using Linux containers on Windows. Obtain this source
checkout, then open PowerShell on Windows or Terminal on macOS in its root directory.
Run one command:

```shell
docker compose -f docs/tutorials/n8n-ledger-lab/compose.yaml up --build -d --wait
```

The first build downloads images and npm dependencies. Compose waits for AITS and n8n
readiness. It builds the dashboard inside Docker, installs the custom node and credential
type, generates a shared AITS key, saves the AITS credential in n8n, imports both
workflows, and publishes **Ledger Dashboard** before starting n8n. No manual file copying,
workflow imports, service-key entry, or host Python/Node.js installation is needed.

| Service | Lab address |
| --- | --- |
| n8n editor | `http://localhost:5679` |
| Automatically connected Ledger Explorer | `http://localhost:5679/webhook/ledger` |
| AITS readiness | `http://localhost:8001/ready` |
| n8n calling AITS inside Docker | `http://aits:8000` |

On your first visit to n8n, create the local owner account. Open **Issue triage ledger
demo**, select an OpenAI credential in **Triage model**, save, and execute the workflow.
The supplied model is `gpt-4.1-mini`; model execution uses your OpenAI account. Follow
section 8 to inspect the recorded run, verify records, and run the ledger audit. The
dashboard starts with an empty live ledger until a run has been recorded.

To configure OpenAI before the first startup, optionally create
`docs/tutorials/n8n-ledger-lab/.env` using the supplied `.env.example`, and set
`OPENAI_API_KEY`. The bootstrap then creates and selects the OpenAI credential. Otherwise,
configure it in the n8n editor. After initialization, edit saved credentials in n8n.

The same optional `.env` supports `N8N_HOST_PORT` (default `5679`), `AITS_HOST_PORT`
(default `8001`), and `AITS_SOURCE` for another source checkout. These defaults allow
the lab to run beside the manual setup. Only loopback ports are published; PostgreSQL
stays on the internal network. The dashboard proxies read requests through n8n using
the saved credential, and anyone who can reach its webhooks can read the ledger.
If you change the n8n port after initialization, also update **Dashboard URL** and the
Sticky Note link in your saved triage workflow.

The `aits-ledger-lab` Compose project has separate PostgreSQL, n8n, and service-key
volumes. Re-running the startup command preserves records, accounts, credentials, and
workflow edits. Bootstrap imports missing workflows and publishes the dashboard on its
first successful setup; later starts leave your saved workflows and publishing choices
alone. If initialization is interrupted, the next startup retries it.

After changing dashboard or custom-node source, run the startup command again to rebuild
the image and recreate the affected container. Workflow JSON changes do not overwrite
your saved n8n workflows; import the updated workflow in the editor, retain the lab's
AITS credential and internal API URL, and publish the dashboard again when applicable.

Run these commands from the checkout root to inspect or stop the lab. Stopping preserves
the volumes; the startup command brings it back.

```shell
docker compose -f docs/tutorials/n8n-ledger-lab/compose.yaml ps
docker compose -f docs/tutorials/n8n-ledger-lab/compose.yaml stop
```

## Troubleshooting

| Symptom | Check or fix |
| --- | --- |
| `psycopg.errors.ConnectionTimeout` during startup | Start PostgreSQL with `up -d --wait postgres`. Match `DATABASE_URL` to `POSTGRES_PORT` and the database credentials, then restart AITS. |
| Port or container name in use | Inspect `docker ps -a`. Use the existing matching service, or choose another host port and update affected URLs and CORS origins. |
| n8n cannot reach AITS | For host-run AITS, use `http://host.docker.internal:8000` and start AITS with `--host 0.0.0.0`. In the all-in-one lab, use `http://aits:8000`. |
| AITS returns HTTP 401 | Enter the secret portion of `name:secret` from the running AITS configuration. The all-in-one lab generates its own key. |
| Unknown custom node or missing AITS API credential type | Verify both JavaScript files in the custom folder, restart n8n, and refresh the editor. For the lab, rerun the startup command to rebuild its image. |
| Recorder requests the full workflow | Clear pinned data and execute from Manual Trigger. Keep the supplied node names and the single text model-call shape. |
| Model request fails | Check the OpenAI credential, account access, quota, and selected model in Triage model. |
| Dashboard URL returns 404 | Publish Ledger Dashboard and check its webhook path `ledger`. Use the production URL. |
| File error or webhook returns 500 | Inspect the serving workflow execution, built HTML, file node container path, and allowlist. Recopy the file after container recreation. |
| Browser downloads the dashboard | Respond with binary field `data`, Content-Type `text/html; charset=utf-8`, and Content-Disposition `inline`. |
| Webhook dashboard connection fails | Check Read AITS's URL expression, selected AITS API credential, and API readiness. Save and publish after configuration changes. |
| Dashboard reports a rejected saved server credential | Update Service Key in the saved AITS API credential to match the running server's AUTH_SERVICE_KEYS secret. Reload the page. |
| Standalone or preview dashboard connection fails | Check its API URL, service key, API readiness, and browser CORS origin. Rebuild after changing the API URL. |
| Dashboard displays Sample ledger | Open the production webhook URL for automatic live data. Standalone and development modes use Connect AITS. |
| Server does not support run search | Restart AITS from the checkout containing `app/routers/lineage_runs.py`. |
| New run or page changes are missing | Refresh runs after recording. Rebuild and copy the HTML after source changes, then reload the webhook tab. |
| Audit reports failures | Inspect the reported record and failure details before using the result as verified evidence. |

### Git Bash path rewriting on Windows

If you use Git Bash and Docker reports an unexpected Windows path for a container file,
the shell may have rewritten a Linux path such as `/home/node/.n8n/custom`. Set
`MSYS2_ARG_CONV_EXCL='*'` for the affected Docker command. For example, run this from the
checkout root in Git Bash when copying the custom node.

```bash
MSYS2_ARG_CONV_EXCL='*' docker cp \
  docs/tutorials/n8n-ledger-lab/custom/AitsLedger.node.js \
  n8n:/home/node/.n8n/custom/AitsLedger.node.js
```

The same prefix applies to affected `docker exec` commands that create directories or
inspect files inside the container. This was the path-conversion issue encountered
during the Windows setup.

For container diagnostics, run `docker logs --tail 100 n8n` in the primary setup. For the
lab, use this command from the checkout root.

```shell
docker compose -f docs/tutorials/n8n-ledger-lab/compose.yaml logs --tail 100 aits n8n
```

The mapping note explains how the workflow execution and its model call become AITS
records. [n8n trace mapping](n8n-trace-mapping.md).
