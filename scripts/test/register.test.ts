import { describe, expect, it, vi } from 'vitest';
import { SwitchApiError, type Addressing } from '@said/switch-client';
import {
  RegistrationConflictError,
  ensureAddressing,
  effectivePolicy,
  manualAddressingFix,
  registerOne,
  roomIdsOf,
  type AddressingOps,
  type AgentHandle,
} from '../lib/register.js';

/** An in-memory stand-in for Switch's addressing rules: who may change whom. */
function world(rules: { selfUpdate: 'allowed' | 'refused'; peerUpdate: 'allowed' | 'refused' }) {
  const policy: Record<string, Addressing> = { said: 'owner_and_owner_agents', builder: 'owner_and_owner_agents' };
  const calls: string[] = [];
  const handle = (name: 'said' | 'builder', other: 'said' | 'builder'): AgentHandle => {
    const ops: AddressingOps = {
      async updateAgentDetail({ agentId, addressing }) {
        const target = agentId as 'said' | 'builder';
        const self = target === name;
        calls.push(`${name}->${target}`);
        const verdict = self ? rules.selfUpdate : rules.peerUpdate;
        if (verdict === 'refused') {
          throw new SwitchApiError(self ? 400 : 403, { detail: self ? "An agent can't change its own settings" : 'not allowed' });
        }
        policy[target] = addressing!;
        return {};
      },
      async getAgentDetail(agentId) {
        return { addressing: { policy: policy[(agentId ?? name) as 'said' | 'builder'] } };
      },
    };
    void other;
    return { name, id: name, ops };
  };
  return { said: handle('said', 'builder'), builder: handle('builder', 'said'), policy, calls };
}

describe('ensureAddressing', () => {
  it('uses the agent\'s own key when Switch allows it (released docs, mock)', async () => {
    const w = world({ selfUpdate: 'allowed', peerUpdate: 'allowed' });
    const outcome = await ensureAddressing(w.said, 'anyone', w.builder);
    expect(outcome).toMatchObject({ method: 'self', effective: 'anyone' });
    expect(w.calls).toEqual(['said->said']);
  });

  it("falls back to the other agent's key when self-update is refused (current Switch source)", async () => {
    const w = world({ selfUpdate: 'refused', peerUpdate: 'allowed' });
    const said = await ensureAddressing(w.said, 'anyone', w.builder);
    expect(said).toMatchObject({ method: 'peer', effective: 'anyone' });
    expect(said.notes[0]).toMatch(/changing its own settings was refused/);
    expect(w.calls).toEqual(['said->said', 'builder->said']);
  });

  it('leaves an already-correct policy alone', async () => {
    const w = world({ selfUpdate: 'refused', peerUpdate: 'refused' });
    const outcome = await ensureAddressing(w.builder, 'owner_and_owner_agents', w.said);
    expect(outcome.method).toBe('unchanged');
    expect(w.calls).toEqual([]);
  });

  it('reports a manual fix when both routes are refused, or there is no peer (personal mode)', async () => {
    const both = world({ selfUpdate: 'refused', peerUpdate: 'refused' });
    const a = await ensureAddressing(both.said, 'anyone', both.builder);
    expect(a).toMatchObject({ method: 'manual', effective: 'owner_and_owner_agents' });
    expect(a.notes).toHaveLength(2);

    const alone = world({ selfUpdate: 'refused', peerUpdate: 'allowed' });
    const b = await ensureAddressing(alone.said, 'anyone', null);
    expect(b.method).toBe('manual');
    expect(alone.calls).toEqual(['said->said']);
    expect(manualAddressingFix('said', 'anyone')).toBe(
      'Switch Console → Your Agents → said → Settings → "Who can talk to your agent" → Anyone',
    );
  });

  it('does not trust an update that reads back unchanged', async () => {
    const w = world({ selfUpdate: 'allowed', peerUpdate: 'allowed' });
    w.said.ops.updateAgentDetail = async () => ({}); // silently ignored
    const outcome = await ensureAddressing(w.said, 'anyone', null);
    expect(outcome.method).toBe('manual');
    expect(outcome.notes.join(' ')).toMatch(/reads back/);
  });

  it('surfaces a bad API key instead of trying fallbacks', async () => {
    const w = world({ selfUpdate: 'allowed', peerUpdate: 'allowed' });
    w.said.ops.updateAgentDetail = async () => {
      throw new SwitchApiError(401, { detail: 'Invalid API key' });
    };
    await expect(ensureAddressing(w.said, 'anyone', w.builder)).rejects.toMatchObject({ status: 401 });
  });
});

describe('registration', () => {
  const base = {
    baseUrl: 'http://switch.test',
    registrationKey: 'reg',
    name: 'said',
    description: 'd',
    displayName: 'Said',
  };

  it('explains a 409 and how to proceed', async () => {
    const register = vi.fn().mockRejectedValue(new SwitchApiError(409, { detail: 'name exists' }));
    const err = await registerOne({ ...base, overwrite: false, existing: null }, { register, keyWorks: async () => false }).catch((e) => e);
    expect(err).toBeInstanceOf(RegistrationConflictError);
    expect(err.message).toMatch(/already exists/);
    expect(err.message).toMatch(/--overwrite/);
    expect(err.message).toMatch(/Your Agents/);
    expect(register).toHaveBeenCalledTimes(1);
    expect(register.mock.calls[0]![0].overwrite).toBeUndefined();
  });

  it('passes overwrite: true when asked', async () => {
    const register = vi.fn().mockResolvedValue({ id: 'a1', apiKey: 'k1' });
    const got = await registerOne({ ...base, overwrite: true, existing: null }, { register, keyWorks: async () => false });
    expect(got).toEqual({ id: 'a1', apiKey: 'k1', reused: false });
    expect(register.mock.calls[0]![0].overwrite).toBe(true);
  });

  it('reuses saved credentials that still work, without calling Switch', async () => {
    const register = vi.fn();
    const got = await registerOne(
      { ...base, overwrite: false, existing: { agentId: 'a0', apiKey: 'k0' } },
      { register, keyWorks: async () => true },
    );
    expect(got).toEqual({ id: 'a0', apiKey: 'k0', reused: true });
    expect(register).not.toHaveBeenCalled();
  });

  it('registers again when the saved key no longer works (and then 409s helpfully)', async () => {
    const register = vi.fn().mockRejectedValue(new SwitchApiError(409, null));
    await expect(
      registerOne({ ...base, overwrite: false, existing: { agentId: 'a0', apiKey: 'dead' } }, { register, keyWorks: async () => false }),
    ).rejects.toBeInstanceOf(RegistrationConflictError);
  });

  it('lets other errors through unchanged', async () => {
    const register = vi.fn().mockRejectedValue(new SwitchApiError(401, { detail: 'bad key' }));
    await expect(registerOne({ ...base, overwrite: false, existing: null }, { register, keyWorks: async () => false })).rejects.toMatchObject({ status: 401 });
  });
});

describe('response readers', () => {
  it('reads the effective policy (including documented aliases)', () => {
    expect(effectivePolicy({ addressing: { policy: 'anyone' } })).toBe('anyone');
    expect(effectivePolicy({ addressing: { policy: 'owner-agents' } })).toBe('owner_and_owner_agents');
    expect(effectivePolicy({ addressing: 'owner' })).toBe('owner_only');
    expect(effectivePolicy({})).toBeNull();
    expect(effectivePolicy(null)).toBeNull();
  });

  it('reads Switch 0.31.0 addressing_policy (null = anyone; preset rules objects)', () => {
    expect(effectivePolicy({ addressing_policy: null })).toBe('anyone');
    expect(
      effectivePolicy({
        addressing_policy: {
          rules: [
            {
              rooms: '*',
              room_groups: '*',
              users: [],
              agents: [],
              owner: true,
              owner_agents: true,
              platform: false,
            },
          ],
        },
      }),
    ).toBe('owner_and_owner_agents');
    expect(
      effectivePolicy({
        addressing_policy: {
          rules: [
            {
              rooms: '*',
              room_groups: '*',
              users: [],
              agents: [],
              owner: true,
              owner_agents: false,
              platform: false,
            },
          ],
        },
      }),
    ).toBe('owner_only');
    expect(
      effectivePolicy({
        addressing_policy: {
          rules: [{ rooms: ['r1'], room_groups: '*', users: [], agents: [], owner: false, owner_agents: false, platform: false }],
        },
      }),
    ).toBe('custom');
    // Prefer nested addressing when both shapes are present (newer Switch).
    expect(
      effectivePolicy({ addressing: { policy: 'anyone' }, addressing_policy: { rules: [] } }),
    ).toBe('anyone');
  });

  it('reads room membership', () => {
    expect(roomIdsOf({ rooms: [{ room_id: 'r1', room_name: 'x' }, { id: 'r2' }, 'r3'] })).toEqual(['r1', 'r2', 'r3']);
    expect(roomIdsOf({ rooms: [] })).toEqual([]);
    expect(roomIdsOf({})).toBeNull();
  });
});
