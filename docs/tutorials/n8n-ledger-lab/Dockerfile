FROM node:22-alpine AS dashboard
WORKDIR /dashboard
COPY tools/ledger-dashboard/package*.json ./
RUN npm ci
COPY tools/ledger-dashboard/ ./
RUN npm run build

FROM n8nio/n8n:2.47.5
COPY --chown=node:node docs/tutorials/n8n-ledger-lab/custom/ /opt/aits-nodes/
COPY --chown=node:node docs/tutorials/n8n-ledger-lab/*.json /opt/aits-lab/workflows/
COPY --chown=node:node docs/tutorials/n8n-ledger-lab/bootstrap.mjs /opt/aits-lab/
COPY --chown=node:node docs/tutorials/n8n-ledger-lab/entrypoint.sh /opt/aits-lab/
COPY --from=dashboard --chown=node:node /dashboard/dist/index.html /home/node/.n8n-files/ledger-dashboard/index.html
USER root
RUN sed -i 's/\r$//' /opt/aits-lab/entrypoint.sh && chmod 755 /opt/aits-lab/entrypoint.sh
USER node
ENTRYPOINT ["tini", "--", "/opt/aits-lab/entrypoint.sh"]
