import { describe, expect, test } from 'vitest';
import { DIRECTOR_BEATS, type DirectorBeat } from '../src/demo/directorScript.js';

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

  test('actions are drawn only from the known action set', () => {
    const known = new Set(['reset', 'attestAll', 'revoke', 'revokeAgentBank', 'revokeQvi']);
    for (const beat of DIRECTOR_BEATS) {
      for (const action of beat.actions) {
        expect(known.has(action)).toBe(true);
      }
    }
  });

  test('the beats form a coherent arc: intro first, attacks last', () => {
    const first = DIRECTOR_BEATS[0] as DirectorBeat;
    const last = DIRECTOR_BEATS[DIRECTOR_BEATS.length - 1] as DirectorBeat;
    expect(first.tab).toBe('wallet');
    expect(last.tab).toBe('attack');
  });
});
