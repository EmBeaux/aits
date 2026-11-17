# Your first n8n ledger

Run an issue-triage workflow in local n8n, then browse the resulting ledger inside n8n. The imported workflow includes **Record AITS Ledger**. It captures the model input and output from the execution, records the triage decision through AITS, and verifies the stored lineage.

## Check your local services

This walkthrough uses n8n in Docker Desktop at [localhost:5678](http://localhost:5678), AITS running on the host at [127.0.0.1:8000](http://127.0.0.1:8000/ready), and PostgreSQL in Docker. You'll need the AITS service key and an OpenAI credential for the demo model. The walkthrough uses n8n 2.47.5 and the supplied workflow's single text model call.

Open [AITS readiness](http://127.0.0.1:8000/ready). When it returns `{"status":"ready"}`, continue to **Install the local node**.

If you need to start AITS and PostgreSQL, use the following example from the root of the AITS checkout. It uses the same host ports as this walkthrough. Add these settings to `.env.local` and replace `replace-with-a-random-secret` with a key you generate and keep for the n8n credential.

```dotenv
POSTGRES_PORT=15432
DATABASE_URL=postgresql+psycopg://bastion:bastion@127.0.0.1:15432/bastion
AUTH_DISABLED=false
AUTH_SERVICE_KEYS=n8n-tutorial:replace-with-a-random-secret
```

With Docker Desktop running and `uv` installed, run these commands from the checkout root in Git Bash or another Bash shell:

```bash
docker compose --env-file .env.local -p aits-tutorial run --rm -d --name aits-tutorial-postgres --service-ports postgres
uv sync --frozen
uv run --frozen fastapi dev
```

Leave AITS running and check the readiness URL again. If AITS starts before PostgreSQL is ready, run `uv run --frozen fastapi dev` again once the PostgreSQL container is healthy. See [AITS configuration](../reference/configuration.md#authentication) for service-key settings.

## Install the local node

Copy [AitsLedger.node.js](n8n-ledger-lab/custom/AitsLedger.node.js) and [AitsApi.credentials.js](n8n-ledger-lab/custom/AitsApi.credentials.js) into `/home/node/.n8n/custom` in your existing n8n container. The credential file adds the **AITS API** option to the editor. The workflow import places the recorder on the canvas after n8n loads both files.

Docker Desktop's **Files** tab can show the destination. If it refuses a drag-and-drop, copy the files with `docker cp`, the method used in this walkthrough. From the checkout root in Git Bash, use the following commands. Replace `n8n` if your container has a different name. `MSYS2_ARG_CONV_EXCL='*'` keeps Git Bash from rewriting Linux container paths.

```bash
cd docs/tutorials/n8n-ledger-lab
MSYS2_ARG_CONV_EXCL='*' docker exec n8n mkdir -p /home/node/.n8n/custom
MSYS2_ARG_CONV_EXCL='*' docker cp custom/AitsLedger.node.js n8n:/home/node/.n8n/custom/AitsLedger.node.js
MSYS2_ARG_CONV_EXCL='*' docker cp custom/AitsApi.credentials.js n8n:/home/node/.n8n/custom/AitsApi.credentials.js
docker restart n8n
```

When the container is back up, refresh [local n8n](http://localhost:5678).

## Import and run the workflow

1. Create a workflow in n8n and choose **Import from File**. Select [issue-triage.json](n8n-ledger-lab/issue-triage.json). **Record AITS Ledger** should already be connected after **Check proposal**.
2. Open **Record AITS Ledger** and create an **AITS API** credential. Set **Server URL** to `http://host.docker.internal:8000`. For **Service Key**, enter the `secret` portion of the `name:secret` pair configured on the running AITS server.
3. Open **Triage model**, select an OpenAI credential and a model it can access, then save the workflow.
4. Click **Execute workflow** and open **Record AITS Ledger**. Its output shows the `allow` or `review` decision and a `ledger` object. Look for `verified: true`. Keep `rootCid` to look up this run and `dutCid` to look up the recorded model call.

```text
Manual Trigger → Prepare issue → Triage agent → Check proposal → Record AITS Ledger
```

Use the included synthetic issue because the ledger stores the model input and output. If the final node reports HTTP 401, check that the n8n credential contains the key from the running AITS server. Fix the reported problem and rerun the full workflow.

## View the ledger in n8n

For the React dashboard served from a published n8n webhook, follow the [dashboard playbook](n8n-dashboard-playbook.md). It provides a run browser, lineage view, and full ledger audit at `/webhook/ledger`. The [trace mapping note](n8n-trace-mapping.md) explains how this workflow's execution and model call become ledger records.

Create a second workflow with **Manual Trigger → HTTP Request**. This workflow reads existing ledger entries without running the triage agent.

1. Set **Method** to **GET** and **URL** to `http://host.docker.internal:8000/lineage/`.
2. For **Authentication**, choose **Predefined Credential Type** and select your **AITS API** credential if it appears. Otherwise, use **Generic Credential Type → Header Auth**. Create a credential with the header name `Authorization` and value `Bearer <your AITS service key>`.
3. Execute the workflow and open the HTTP Request node's **Table** output to see the recorded runs. Use the `root` column to pick a run, or use `ledger.rootCid` from the recorder output for a specific execution.
4. Change the URL to `http://host.docker.internal:8000/lineage/<root CID>/` and run it again. Open the **JSON** output and expand `nodes` to see the recorded workflow steps. To see the model input and output, use `http://host.docker.internal:8000/duts/<DUT CID>/` with `ledger.dutCid` from the recorder.

See the [lineage API](../reference/lineage.md) and [verification API](../reference/verification.md) for more queries.

## Where the records live

In the setup above, AITS writes to the `bastion` PostgreSQL database in `aits-tutorial-postgres`. The `aits-tutorial_bastion_pg_data` Docker volume persists the data across container restarts. The `dut` table holds model calls, `lineage_tag` holds workflow lineage, and `commit_log` holds ledger entries.

## Run the all-in-one lab instead

For a separate local n8n instance, run `docker compose up --build --wait` from the [lab folder](n8n-ledger-lab/). If your existing n8n uses port 5678, copy the lab's [.env.example](n8n-ledger-lab/.env.example) to `.env`, uncomment `N8N_HOST_PORT=5679`, and open [localhost:5679](http://localhost:5679) after startup. This setup loads the node and generates its AITS service key automatically. Import the same workflow and configure **Triage model** before running it.
