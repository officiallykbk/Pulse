import { describe, expect, it } from 'vitest';
// @ts-expect-error Executable Node ESM script intentionally exposes testable helpers without a declaration bundle.
import { buildCleanupSql, buildSeedPhases, SCALE_PRESETS } from '../scripts/seed-mock-data.mjs';
// @ts-expect-error Executable Node ESM script intentionally exposes testable helpers without a declaration bundle.
import { evaluateScenario, percentile } from '../scripts/benchmark-platform.mjs';

describe('mock data tooling', () => {
  it('provides increasingly demanding bounded scale profiles', () => {
    expect(SCALE_PRESETS.smoke.users).toBeLessThan(SCALE_PRESETS.medium.users);
    expect(SCALE_PRESETS.medium.videos).toBeLessThan(SCALE_PRESETS.large.videos);
    expect(SCALE_PRESETS.medium.likes).toBe(100_000);
    expect(SCALE_PRESETS.large.likes).toBeLessThanOrEqual(
      SCALE_PRESETS.large.users * SCALE_PRESETS.large.videos,
    );
  });

  it('builds deterministic transactional phases scoped to synthetic records', () => {
    const phases = buildSeedPhases({ name: 'smoke', ...SCALE_PRESETS.smoke }, 'https://test.supabase.co');
    expect(phases).toHaveLength(4);
    for (const phase of phases) {
      expect(phase.sql).toMatch(/^begin;/);
      expect(phase.sql).toMatch(/commit;$/);
      expect(phase.sql).toContain('pulse-mock');
    }
    expect(phases[0].sql).toContain("title like '[MOCK]%'");
    expect(phases[0].sql).toContain('https://test.supabase.co/storage/v1/object/public/videos/mock');
  });

  it('keeps cleanup limited to mock identities and marked content', () => {
    const cleanup = buildCleanupSql();
    expect(cleanup).toContain('mock.user.%@example.test');
    expect(cleanup).toContain("title like '[MOCK]%'");
    expect(cleanup).not.toMatch(/truncate/i);
    expect(cleanup).not.toMatch(/delete from auth\.users/i);
  });

  it('calculates percentile thresholds predictably', () => {
    expect(percentile([10, 20, 30, 40, 50], 0.95)).toBe(50);
    expect(evaluateScenario({ errorRate: 0, p95: 900 })).toBe(true);
    expect(evaluateScenario({ errorRate: 0.02, p95: 900 })).toBe(false);
    expect(evaluateScenario({ errorRate: 0, p95: 2_000 })).toBe(false);
  });
});
