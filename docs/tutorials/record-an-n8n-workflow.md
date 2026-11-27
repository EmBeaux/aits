# Record an n8n workflow in AITS

In this tutorial you'll send a synthetic workflow trace from n8n to a hosted
AITS ledger. Then you'll use its content identifier (CID) to check the
recorded execution in the same workflow.

## Before you start

- An existing n8n instance with community nodes enabled and an owner or
  administrator who can install them. This example uses n8n 2.47.5 and the
  AITS community node 0.1.1.
- An AITS 0.3.0 server that your n8n instance can reach over HTTPS, and a
  service key issued by its operator. Ask the operator for a demo or test
  ledger if you're following along for the first time.
- The [record-and-verify workflow](https://raw.githubusercontent.com/bastion-one/aits-n8n/v0.1.1/examples/offline-record-and-verify.json).
  Save the file as `offline-record-and-verify.json`.

The fixture supplies its own trace and requires no model credentials.

## Step 1 — Install the AITS node

In self-hosted n8n, open **Settings → Community Nodes → Install**. Enter
`n8n-nodes-aits`, review the installation prompt, and select **Install**.
If you already have the package, check that it is version 0.1.1 or later.

On n8n Cloud, an owner or administrator can install **AITS** from **More from
the community** in the node picker once the package is verified and the
instance has verified community nodes enabled. If **AITS** is absent, use a
self-hosted instance for this tutorial. See
[n8n's verified community node instructions](https://docs.n8n.io/integrations/community-nodes/installation-and-management/install-verified-community-nodes).

## Step 2 — Connect to the hosted ledger

Create an **AITS API** credential in n8n.

1. Enter the ledger's HTTPS base URL in **Server URL**. For example,
   `https://aits.example.com`. Use the URL reachable from the n8n runtime.
2. Paste the bearer service key into **Service Key**. If the operator gave you
   a self-hosted `name:secret` entry, enter the secret portion.
3. Save the credential and check that n8n reports a successful connection.

Keep the service key in the credential and select it on each AITS node.
The trace contains workflow events. See the
[authentication reference](../reference/configuration.md#authentication)
for how a server issues and accepts service keys.

## Step 3 — Import and run the workflow

1. Create a workflow in n8n. In the editor menu, select **Import from File**
   and open `offline-record-and-verify.json`.
2. In **Record Execution** and **Verify Record**, select the same **AITS API**
   credential. Save the workflow.
3. Select **Execute workflow** to run from **Manual Trigger**. **Create Fixture
   Trace** produces a root event and one linked step. **Record Execution**
   sends the trace to AITS.
4. Open **Record Execution** and inspect its output. Look for
   `aits.status: "recorded"` and copy `aits.lineageCid` if you want to look up
   the recorded step later.
5. Open **Verify Record**. It receives the same CID and should return
   `aits.status: "verified"` and `aits.valid: true`.

A recording error follows the **Review Recording Warning** branch. Open its
input to see the failed stage and warning. For HTTP 401, check that the
credential uses the key issued by the selected ledger. For a connection error,
check that the AITS address is reachable from n8n and that the server's
`/ready` endpoint reports ready. If **Verify Record** returns
`aits.valid: false`, inspect `aits.propertyViolated` and `aits.message`.

## What verification tells you

AITS checks that the record matches its CID, that its linked lineage is
structurally consistent, and that the record and its direct links satisfy
the relevant ledger observation checks. This example records evidence and
reports the verdict. Workflow safety rules, such as deciding whether a
request needs human review, run separately in n8n. See the
[verification reference](../reference/verification.md#checks-and-responses).

## Optional local setup

If you need a local test ledger, follow the
[Docker Compose example](https://github.com/bastion-one/aits-n8n#start-a-local-stack).
For a tamper demonstration, use a separate disposable ledger and follow
[the tamper exercise](your-first-ledger.md#step-7--watch-it-catch-a-tampered-record).
