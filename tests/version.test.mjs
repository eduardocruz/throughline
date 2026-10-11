import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { PLUGIN_VERSION } from '../scripts/telemetry.mjs';

test('the version the ping reports is the plugin version', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8'));
  assert.equal(PLUGIN_VERSION, manifest.version);
});
