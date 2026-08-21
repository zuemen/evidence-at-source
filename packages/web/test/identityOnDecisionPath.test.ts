/**
 * 題05 Q1／Q2 在**做決定的那條路上**。
 *
 * 這個檢查一直都在，也一直有測試——但開戶流程從來沒有把參數傳進去。仲介拿著勞工手機
 * 的情境，也就是整個機制存在的理由，在實際判斷路徑上根本沒被擋。
 *
 * 下面兩個測試的差別就是那個參數。它們會在有人把它拿掉的時候轉紅。
 */
import { describe, expect, test } from 'vitest';
import { createDemoWorld } from '@eas/web';

describe('身分綁定在開戶路徑上，不只在面板上', () => {
  test('a bound wallet gets an assessment', async () => {
    const world = await createDemoWorld();
    await world.attestAll();

    const split = await world.split();

    expect(split.bank.refusedWith).toBeNull();
    expect(split.bank.assessment).not.toBeNull();
  });

  test('once the binding ends, the bank refuses instead of assessing', async () => {
    const world = await createDemoWorld();
    await world.attestAll();

    world.simulateLostDevice();
    const split = await world.split();

    expect(split.bank.refusedWith).toBe('WORKER_IDENTITY_UNBOUND');
    // Not "assessed and declined" — never assessed at all. A refusal at the
    // credential layer means no worker conclusion was ever read.
    expect(split.bank.assessment).toBeNull();
    expect(split.bank.disclosed).toEqual({});
  });
});
