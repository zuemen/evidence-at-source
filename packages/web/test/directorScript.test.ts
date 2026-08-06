import { describe, expect, test } from 'vitest';
import {
  DIRECTOR_BEATS,
  directorTranscript,
  type DirectorAction,
  type DirectorBeat,
} from '../src/demo/directorScript.js';
import { createDemoWorld } from '@eas/web';

describe('director script', () => {
  test('has an ordered set of beats covering all three tabs', () => {
    expect(DIRECTOR_BEATS.length).toBeGreaterThanOrEqual(7);

    const tabs = new Set(DIRECTOR_BEATS.map((b) => b.tab));
    expect(tabs).toEqual(new Set(['wallet', 'console', 'attack']));
  });

  test('every beat has a title, narration, and a unique id', () => {
    const ids = new Set<string>();
    for (const beat of DIRECTOR_BEATS) {
      expect(beat.title.length).toBeGreaterThan(0);
      expect(beat.narration.length).toBeGreaterThan(0);
      expect(ids.has(beat.id)).toBe(false);
      ids.add(beat.id);
    }
  });

  test('every beat starts from a clean state so beats never stack', () => {
    for (const beat of DIRECTOR_BEATS) {
      expect(beat.actions[0]).toBe('reset');
    }
  });

  test('every action a beat declares is one the world can actually perform', async () => {
    // Stronger than checking the strings against a list: the list and the world
    // could drift apart, and the failure would only show up in front of judges.
    const world = await createDemoWorld();
    const runnable: Record<DirectorAction, () => unknown> = {
      reset: () => undefined,
      attestAll: () => world.attestAll(),
      revoke: () => world.revokeSubject(),
      revokeAgentBank: () => world.revokeAgentDelegation('bank'),
      revokeQvi: () => world.revokeQvi(),
      attemptBrokerWallet: () => world.attemptBrokerWallet(),
      revokeAuditor: () => world.revokeAuditor(),
      revokeReviewer: () => world.revokeReviewer(),
    };

    for (const beat of DIRECTOR_BEATS) {
      for (const action of beat.actions) {
        expect(typeof runnable[action], `beat ${beat.id} declares ${action}`).toBe('function');
        await runnable[action]();
      }
    }
  });

  test('this weeks capabilities each appear in the arc', () => {
    // Named individually rather than counted: a count still passes if one is
    // dropped and another duplicated.
    const ids = new Set(DIRECTOR_BEATS.map((beat) => beat.id));

    for (const id of ['one-wallet', 'zk-proof', 'governance', 'auditor-struck-off', 'reviewer-left']) {
      expect(ids.has(id), `the arc has no beat for ${id}`).toBe(true);
    }
  });

  test('the narration names the worker and the system never does', async () => {
    // The story needs a person; the credentials must not carry one. Stating
    // either half without the other would be the usual lie.
    const world = await createDemoWorld();
    const narration = DIRECTOR_BEATS.map((beat) => beat.narration).join('');

    expect(narration).toContain('Andi');
    expect(JSON.stringify(world.snapshot())).not.toContain('Andi');
  });

  test('every beat carries narration a presenter can read aloud', () => {
    for (const beat of DIRECTOR_BEATS) {
      expect(beat.narration.length, `beat ${beat.id} is too thin to narrate`).toBeGreaterThan(60);
    }
  });

  test('the beats form a coherent arc: intro first, attacks last', () => {
    const first = DIRECTOR_BEATS[0] as DirectorBeat;
    const last = DIRECTOR_BEATS[DIRECTOR_BEATS.length - 1] as DirectorBeat;
    expect(first.tab).toBe('wallet');
    expect(last.tab).toBe('attack');
  });
});

describe('the transcript a presenter takes into the recording booth', () => {
  test('it carries every beat, in order, with its narration', () => {
    const transcript = directorTranscript();

    for (const [index, beat] of DIRECTOR_BEATS.entries()) {
      expect(transcript).toContain(`${index + 1}. ${beat.title}`);
      expect(transcript).toContain(beat.narration);
    }
  });

  test('it says up front that the data and the person are synthetic', () => {
    // The transcript leaves this repository and gets read aloud. Whatever a
    // listener remembers about Andi, they should not remember him as real.
    const transcript = directorTranscript();

    expect(transcript).toContain('合成資料');
    expect(transcript).toContain('虛構');
  });
});
