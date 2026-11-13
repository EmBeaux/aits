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

The dashboard expects AITS at `http://127.0.0.1:8000`. To use another local port, set `AITS_API_URL` in `.env.local` and restart the dashboard. The dashboard binds to loopback and proxies read-only lineage, DUT, and verification requests to AITS.

Select a run to see its recorded branches and joins on the desktop canvas. Drag empty space to pan, scroll to zoom, and use **Fit graph** to return to the overview. Click a step to inspect it or click its attached **DUT record** to see the model input and output beside the canvas. Narrow screens show a vertical timeline with the same drill-down.

**Open CID** jumps directly to a known root or DUT. The dashboard URL preserves the selected record so it can be reopened after connecting. Select **Verify record** to check a step or model call with AITS.

To check the production bundle locally, run `npm run build` and then `npm run preview`.
