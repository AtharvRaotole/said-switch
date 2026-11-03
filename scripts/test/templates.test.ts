import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot } from '@said/runtime';

/**
 * No YAML parser is installed, so these are structural sanity checks. The templates were also validated
 * against Switch's own parser (template_v2.compile_v2, RoomTemplateDocument, lint_template); see the report.
 */
const read = (name: string) => readFileSync(join(repoRoot, 'templates', name), 'utf8');

describe.each([
  ['said-business.template.yaml', ['said_agent', 'builder_agent', 'client_user']],
  ['said-personal.template.yaml', ['said_agent', 'partner_user']],
] as const)('%s', (file, params) => {
  const text = read(file);
  const body = text.split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');

  it('is a version 2 room template on the Mattermost bridge', () => {
    expect(body).toMatch(/^version: 2$/m);
    expect(body).toMatch(/^resources:$/m);
    expect(body).toMatch(/type: room/);
    expect(body).toMatch(/default: \[Mattermost, \$first\]/);
    expect(body).toMatch(/channel_type: channel_private/);
  });

  it('uses only declared placeholders', () => {
    const declared = new Set([...params, 'room_name', 'bridge', '$creator']);
    const used = new Set([...body.matchAll(/\{(\$?[A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1]!));
    for (const name of used) expect(declared, `undeclared placeholder {${name}}`).toContain(name);
    for (const p of params) expect(used, `param ${p} is never used`).toContain(p);
  });

  it('documents every command and the consent rules in the room instructions', () => {
    for (const needle of ['Propose:', 'Terms DRF-001', 'Revise DRF-001', 'Accept DRF-001', 'Reject DRF-001', 'Withdraw DRF-001', 'Status', 'enroll', 'BOTH']) {
      expect(body, needle).toContain(needle);
    }
    expect(body).toMatch(/never counts as approval/i);
  });

  it('does not pre-create the ledger document and keeps tabs out of the YAML', () => {
    expect(body).not.toMatch(/^\s*docs:/m);
    expect(text).not.toContain('\t');
  });

  it('explains the manual !invite-agent fallback at the top', () => {
    expect(text.split('\n').slice(0, 40).join('\n')).toContain('!invite-agent @said');
  });
});

describe('business template specifics', () => {
  const body = read('said-business.template.yaml');
  it('names both agents and says the builder acts only on Said authorizations', () => {
    expect(body).toContain('agents: ["{said_agent}", "{builder_agent}"]');
    expect(body).toMatch(/only acts on that Said authorization/);
  });
});

describe('personal template specifics', () => {
  const body = read('said-personal.template.yaml');
  it('names only said (no builder)', () => {
    expect(body).toContain('agents: ["{said_agent}"]');
    expect(body.split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n')).not.toContain('builder_agent');
  });
});
