import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const statePath = '/home/node/.n8n/aits-lab.json';
const serviceKey = readFileSync(process.env.AITS_KEY_FILE, 'utf8').trim();
const keyHash = createHash('sha256').update(serviceKey).digest('hex');
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'aits-lab-'));
const serverUrl = process.env.AITS_URL || 'http://aits:8000';
const dashboardUrl = process.env.AITS_DASHBOARD_URL || 'http://localhost:5679/webhook/ledger';
const aitsCredential = { id: 'aitsLabApi', name: 'AITS lab' };
const modelCredential = { id: 'aitsLabOpenAi', name: 'OpenAI lab' };

const run = (...args) => execFileSync('n8n', args, { stdio: 'inherit' });

const writeJson = (name, value) => {
  const path = join(temporaryDirectory, name);
  writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
  return path;
};

const readWorkflow = (name) => JSON.parse(
  readFileSync(`/opt/aits-lab/workflows/${name}.json`, 'utf8'),
);

const exportWorkflows = (name, allowEmpty = false) => {
  const path = join(temporaryDirectory, name);
  try {
    execFileSync('n8n', ['export:workflow', '--all', `--output=${path}`], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (error) {
    const output = `${error.stdout || ''}\n${error.stderr || ''}`;
    if (allowEmpty && output.includes('No workflows found with specified filters')) return [];
    process.stderr.write(output);
    throw error;
  }
  return JSON.parse(readFileSync(path, 'utf8'));
};

try {
  if (state.keyHash !== keyHash) {
    console.log('Configuring the shared AITS lab credential.');
    const credentials = [{
      ...aitsCredential,
      type: 'aitsApi',
      data: { serverUrl, serviceKey },
    }];

    if (!state.ready && process.env.OPENAI_API_KEY) {
      credentials.push({
        ...modelCredential,
        type: 'openAiApi',
        data: { apiKey: process.env.OPENAI_API_KEY },
      });
    }

    run('import:credentials', `--input=${writeJson('credentials.json', credentials)}`);
    const credentialPath = join(temporaryDirectory, 'saved-credentials.json');
    run('export:credentials', '--all', `--output=${credentialPath}`);
    const saved = JSON.parse(readFileSync(credentialPath, 'utf8'));
    if (!credentials.every(({ id }) => saved.some((item) => item.id === id))) {
      throw new Error('Lab credential import did not complete. See the n8n logs above.');
    }
  }

  if (!state.ready) {
    console.log('Preparing the lab workflows.');
    const existing = exportWorkflows('existing.json', true);
    const existingIds = new Set(existing.map(({ id }) => id));
    const triage = readWorkflow('issue-triage');
    triage.id = 'aitsLabTriage';
    triage.name = 'Issue triage ledger demo';

    for (const node of triage.nodes) {
      if (node.name === 'Record AITS Ledger') {
        node.credentials = { aitsApi: aitsCredential };
        node.parameters.dashboardUrl = dashboardUrl;
      }
      if (node.name === 'Triage model' && process.env.OPENAI_API_KEY) {
        node.credentials = { openAiApi: modelCredential };
      }
      if (node.name === 'Open Ledger Dashboard') {
        node.parameters.content = [
          '## Ledger Dashboard',
          `[Open live ledger](${dashboardUrl})`,
          '',
          'Browse recorded runs and run Ledger audit. AITS connects automatically.',
        ].join('\n');
      }
    }

    const dashboard = readWorkflow('ledger-dashboard');
    const readAits = dashboard.nodes.find(({ name }) => name === 'Read AITS');
    readAits.parameters.url = `={{ '${serverUrl}' + $json.query.path }}`;
    readAits.credentials = { aitsApi: aitsCredential };

    const missing = [triage, dashboard].filter(({ id }) => !existingIds.has(id));
    if (missing.length) {
      run('import:workflow', `--input=${writeJson('workflows.json', missing)}`);
    }

    // Publishing before the server starts registers both dashboard webhooks on boot.
    run('publish:workflow', `--id=${dashboard.id}`);
    const installed = exportWorkflows('check.json');
    const installedIds = new Set(installed.map(({ id }) => id));
    if (![triage.id, dashboard.id].every((id) => installedIds.has(id))) {
      throw new Error('Lab workflow import did not complete. See the n8n logs above.');
    }
    if (!installed.find(({ id }) => id === dashboard.id)?.active) {
      throw new Error('Ledger Dashboard was not published. See the n8n logs above.');
    }
  }

  writeFileSync(statePath, JSON.stringify({ ready: true, keyHash }), { mode: 0o600 });
  console.log(`AITS lab ready. Ledger Explorer: ${dashboardUrl}`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
