# Connect n8n to a live AITS server

Use the [AITS community node](https://github.com/bastion-one/aits-n8n) to record an
n8n workflow trace in a running AITS ledger and verify the resulting content
identifier (CID). This walkthrough uses a synthetic trace and works with a
local or hosted ledger.

## Install the AITS node

In self-hosted n8n, open **Settings → Community Nodes → Install** and enter
`n8n-nodes-aits` if it is available in the registry. To install a tarball
built from source, follow the [package installation guide](https://github.com/bastion-one/aits-n8n#install).

## Connect to your server

1. For a self-hosted AITS server, follow the [server quickstart](../../README.md#quickstart)
   if you need to start it. Configure a service key and enable authentication.
   The [authentication reference](../reference/configuration.md#authentication)
   describes the `AUTH_SERVICE_KEYS` setting. For a hosted ledger, obtain its URL
   and a service key from the server operator.
2. In n8n, create an **AITS API** credential. Enter the base **Server URL** as
   seen by the n8n runtime. For a hosted server, use its HTTPS URL, such as
   `https://aits.example.com`. If n8n and AITS share a Docker network, use the
   AITS service name and container port, such as `http://aits:8000`. If AITS
   runs on the Docker Desktop host, use `http://host.docker.internal:8000`.
3. In **Service Key**, enter the secret issued by that server. For an
   `AUTH_SERVICE_KEYS` entry in the form `name:secret`, enter the secret portion.
   Save and test the credential.

If n8n cannot reach the server, check the address and network from the n8n
runtime. The server's `/ready` endpoint checks database readiness. If the n8n
administrator has enabled SSRF protection, the administrator may need to
allowlist a private AITS endpoint. For HTTP 401, check that the service key
belongs to the selected server.

## Record and verify a trace

1. From the [community node examples](https://github.com/bastion-one/aits-n8n/tree/main/examples),
   download `offline-record-and-verify.json` and import it into n8n. This fixture
   runs against the ledger in your selected credential.
2. In **Record Execution** and **Verify Record**, select the same **AITS API**
   credential.
3. Run the workflow from **Manual Trigger**. In **Record Execution**, confirm
   that `aits.status` is `recorded` and copy `aits.lineageCid` if you need to refer
   to the record later. **Verify Record** receives that CID and should return
   `aits.valid: true`. If recording fails, open **Review Recording Warning**
   and inspect the returned `aits` error details.

To record a workflow that makes a model call, follow the
[issue-triage example](https://github.com/bastion-one/aits-n8n#record-a-live-issue-triage-run)
in the community node repository.
