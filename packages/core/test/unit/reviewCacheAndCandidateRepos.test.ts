import { describe, it, expect } from 'vitest';
import { runMigrations } from '../../src/db/migrate';
import { makeInvestmentReviewCacheRepo } from '../../src/repositories/investmentReviewCacheRepo';
import { makeCandidateDetailsRepo } from '../../src/repositories/candidateDetailsRepo';

describe('investmentReviewCacheRepo', () => {
  it('puts, gets and overwrites by signature', () => {
    const { db, sqlite } = runMigrations(':memory:');
    const repo = makeInvestmentReviewCacheRepo(db);
    expect(repo.get('s1')).toBeNull();
    repo.put({ signature: 's1', reviewJson: '{"a":1}' });
    repo.put({ signature: 's1', reviewJson: '{"a":2}', model: 'opus' });
    expect(repo.get('s1')?.reviewJson).toBe('{"a":2}');
    expect(repo.get('s1')?.model).toBe('opus');
    sqlite.close();
  });
});

describe('candidateDetailsRepo', () => {
  it('upserts and prunes old rows', () => {
    const { db, sqlite } = runMigrations(':memory:');
    const repo = makeCandidateDetailsRepo(db);
    repo.upsert({ amfiCode: '1', detailsJson: '{}' });
    sqlite.prepare(`UPDATE candidate_details SET fetched_at = '2026-01-01 00:00:00' WHERE amfi_code = '1'`).run();
    repo.upsert({ amfiCode: '2', detailsJson: '{}' });
    expect(repo.pruneOlderThan('2026-06-01')).toBe(1);
    expect(repo.get('1')).toBeNull();
    expect(repo.get('2')).not.toBeNull();
    sqlite.close();
  });
});
