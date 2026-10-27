import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parse } from 'yaml';

const workflow = parse(await readFile(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8'));

test('CI actions use immutable revisions and do not persist Git credentials', () => {
  for (const job of Object.values(workflow.jobs)) {
    assert.ok(job['timeout-minutes'] > 0 && job['timeout-minutes'] <= 15);
    for (const step of job.steps) {
      if (!step.uses) continue;
      assert.match(step.uses, /^actions\/[a-z-]+@[a-f0-9]{40}$/);
      if (step.uses.startsWith('actions/checkout@')) {
        assert.equal(step.with?.['persist-credentials'], false);
      }
    }
  }
  const commands = workflow.jobs.build.steps.map((step) => step.run ?? '').join('\n');
  assert.match(commands, /npm ci --ignore-scripts/);
  assert.match(commands, /npm audit --audit-level=high/);
});

test('untrusted PR builds cannot acquire deployment permissions', () => {
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.ok('pull_request' in workflow.on);
  assert.ok(!('pull_request_target' in workflow.on));
  assert.equal(workflow.jobs.build.permissions, undefined);
  assert.equal(workflow.jobs.build.environment, undefined);
  assert.match(workflow.jobs.hosting.if, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow.jobs.hosting.if, /github\.event_name != 'pull_request'/);
  assert.deepEqual(workflow.jobs.hosting.permissions, { pages: 'read' });
  assert.deepEqual(workflow.jobs.deploy.needs, ['build', 'hosting']);
  assert.equal(workflow.jobs.deploy.if, "needs.hosting.outputs.enabled == 'true'");
  assert.deepEqual(workflow.jobs.deploy.permissions, { pages: 'write', 'id-token': 'write' });
  assert.equal(workflow.jobs.deploy.environment.name, 'github-pages');
  assert.ok(workflow.jobs.deploy.steps.every((step) => !step.run), 'Privileged deploy must not execute repository shell code');
});
