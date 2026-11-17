# AITS Ledger Explorer

A local React and Mantine dashboard for browsing AITS lineage roots, following recorded workflow steps, and inspecting model calls (DUTs).

## Run locally

On Windows, double-click **Open Dashboard.cmd**. It installs dependencies if needed and opens the dashboard in your default browser. Keep the launcher window open while using the dashboard.

With Node.js 20.19+ or 22.12+ installed, you can also run these commands from this directory:

```sh
npm ci
npm run dev
```

Open [127.0.0.1:4173](http://127.0.0.1:4173). The dashboard starts with labeled sample data. To browse your own records, click **Connect AITS** and enter the service key from your running AITS server. Use the `secret` portion if the server configuration contains a `name:secret` pair. The key stays in memory for the current page.

The dashboard expects AITS at `http://127.0.0.1:8000`. To use another API origin, set `AITS_API_URL` in `.env.local` and restart the dashboard. The development server binds to loopback and proxies read-only ledger requests to AITS.

Filter runs by **Run start**, including a local date and time range. Use **More filters** for workflow, issue or business key, and recorded decision. **Load more runs** pages through the matching history. **Latest activity first** sorts by the most recent event in each run.

Select a run to see its recorded decision, branches, and joins. Drag the canvas to pan, scroll to zoom, or use **Fit graph** to return to the overview. Switch to **Step list** to scan the same run without panning. Narrow screens start in the step list.

Use **Trace inputs** to highlight the steps behind a decision. Follow evidence links to the exact step in another run, or open an attached call to read its input, output, and recorded configuration. The inspector shows both the event time and when AITS first recorded it. **Open by CID** jumps directly to a run, step, or call. The URL preserves the selection so it can be reopened after connecting.

**Verify record** checks a selected record's integrity. **Ledger audit** checks the entire ledger and reports failures separately from workflow decisions. Restart AITS from this checkout if the dashboard reports that the running server does not support run search. Older n8n records show the workflow ID when no name was recorded.

To check the production bundle locally, run `npm run build` and then `npm run preview`.

## Serve from n8n

`npm run build` produces one self-contained `dist/index.html`, including the JavaScript, CSS, and fonts. Production builds call the API origin configured by `AITS_API_URL` at build time. The default is `http://127.0.0.1:8000`. Rebuild to change that origin. The service key is entered through **Connect AITS** and stays in the tab's memory.

The [n8n dashboard playbook](../../docs/tutorials/n8n-dashboard-playbook.md) covers the serving workflow, local CORS settings, deployment commands, and verification. The dashboard opens with sample data until you connect.
