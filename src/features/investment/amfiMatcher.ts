/**
 * AMFI Code Matcher
 * Automatically matches scheme names to AMFI codes using the mfapi.in search API
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import { searchSchemes, getSchemeInfo } from './navService';
import { updateSchemeAmfiCode } from './services/schemeService';

type UnmatchedScheme = {
  id: number;
  scheme_name: string;
  amc_name: string | null;
};

type PlanType = 'direct' | 'regular' | 'unknown';
type DistType = 'growth' | 'dividend' | 'idcw' | 'unknown';

/**
 * Extract the plan and distribution classifiers from a scheme name.
 * These must not be stripped before matching — they disambiguate variants.
 */
function extractVariant(name: string): { plan: PlanType; dist: DistType } {
  const lower = name.toLowerCase();
  const plan: PlanType = /\bdirect\b/.test(lower)
    ? 'direct'
    : /\bregular\b/.test(lower)
      ? 'regular'
      : 'unknown';
  const dist: DistType =
    /\bgrowth\b/.test(lower)
      ? 'growth'
      : /\bidcw\b/.test(lower)
        ? 'idcw'
        : /\bdividend\b/.test(lower)
          ? 'dividend'
          : 'unknown';
  return { plan, dist };
}

/**
 * Normalize scheme name for search query.
 * Strips punctuation/plan/dist labels so the core fund name remains.
 */
function normalizeForSearch(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*-\s*(direct|regular)\s*(plan|growth|dividend|idcw)?\s*/gi, ' ')
    .replace(/\s*-\s*(growth|dividend|idcw)\s*(option)?\s*/gi, ' ')
    .replace(/\s*(direct|regular)\s*(plan)?\s*$/gi, '')
    .replace(/\s*(growth|dividend|idcw)\s*(option)?\s*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractKeywords(name: string): string[] {
  const normalized = normalizeForSearch(name);
  return normalized.split(' ').filter((w) => w.length > 2);
}

/**
 * Core-name similarity (ignores plan/dist).
 */
function calculateSimilarity(name1: string, name2: string): number {
  const keywords1 = extractKeywords(name1);
  const keywords2 = extractKeywords(name2.toLowerCase());

  if (keywords1.length === 0 || keywords2.length === 0) return 0;

  let matches = 0;
  for (const kw of keywords1) {
    if (keywords2.some((k2) => k2.includes(kw) || kw.includes(k2))) {
      matches++;
    }
  }

  return matches / Math.max(keywords1.length, keywords2.length);
}

/**
 * Find best AMFI code match for a scheme name.
 *
 * Scoring:
 *   totalScore = coreSimilarity + planBonus + distBonus
 *
 * planBonus:
 *   +0.6 if candidate's plan matches user's plan
 *   -1.0 if candidate's plan contradicts user's plan (eliminates)
 *   +0.2 for candidate=direct when user's plan is unknown (Groww default)
 *
 * distBonus:
 *   +0.4 if candidate's dist matches user's dist
 *   -0.6 if candidate's dist contradicts user's dist
 *   +0.1 for candidate=growth when user's dist is unknown (most common)
 */
async function findBestMatch(
  schemeName: string,
  amcName: string | null
): Promise<string | null> {
  const searchTerms = normalizeForSearch(schemeName).split(' ').slice(0, 3).join(' ');

  if (searchTerms.length < 3) {
    console.log(`[amfiMatcher] Search term too short for: ${schemeName}`);
    return null;
  }

  const userVariant = extractVariant(schemeName);
  console.log(
    `[amfiMatcher] Searching for: "${searchTerms}" (plan=${userVariant.plan}, dist=${userVariant.dist})`
  );

  try {
    const results = await searchSchemes(searchTerms);

    if (results.length === 0) {
      console.log(`[amfiMatcher] No results found for: ${searchTerms}`);
      return null;
    }

    const scoredResults = results.map((result) => {
      const candidateVariant = extractVariant(result.schemeName);
      const coreScore = calculateSimilarity(schemeName, result.schemeName);

      // Plan match
      let planBonus = 0;
      if (userVariant.plan !== 'unknown' && candidateVariant.plan !== 'unknown') {
        planBonus = userVariant.plan === candidateVariant.plan ? 0.6 : -1.0;
      } else if (userVariant.plan === 'unknown' && candidateVariant.plan === 'direct') {
        planBonus = 0.2; // Groww default
      }

      // Distribution match
      let distBonus = 0;
      if (userVariant.dist !== 'unknown' && candidateVariant.dist !== 'unknown') {
        distBonus = userVariant.dist === candidateVariant.dist ? 0.4 : -0.6;
      } else if (userVariant.dist === 'unknown' && candidateVariant.dist === 'growth') {
        distBonus = 0.1;
      }

      return {
        ...result,
        variant: candidateVariant,
        coreScore,
        score: coreScore + planBonus + distBonus,
      };
    });

    scoredResults.sort((a, b) => b.score - a.score);

    const bestMatch = scoredResults[0];
    // Acceptance threshold is on core similarity, not the composite score
    if (bestMatch.coreScore > 0.5) {
      console.log(
        `[amfiMatcher] Best match: ${bestMatch.schemeName} (score: ${bestMatch.score.toFixed(2)}, core: ${bestMatch.coreScore.toFixed(2)}, code: ${bestMatch.amfiCode})`
      );
      return bestMatch.amfiCode;
    }

    console.log(
      `[amfiMatcher] No good match found (best core: ${bestMatch.coreScore.toFixed(2)})`
    );
    return null;
  } catch (error) {
    console.error(`[amfiMatcher] Search failed:`, error);
    return null;
  }
}

/**
 * Get all schemes that don't have AMFI codes
 */
async function getUnmatchedSchemes(db: SQLiteDatabase): Promise<UnmatchedScheme[]> {
  const rows = await db.getAllAsync<UnmatchedScheme>(
    `
      SELECT id, scheme_name, amc_name
      FROM investment_schemes
      WHERE amfi_code IS NULL
      ORDER BY scheme_name
    `
  );
  return rows;
}

/**
 * Auto-match all schemes without AMFI codes
 * Returns count of successfully matched schemes
 *
 * options.force=true clears existing AMFI codes first so every scheme is
 * re-matched with the current scoring rules.
 */
export async function autoMatchAmfiCodes(
  db: SQLiteDatabase,
  options?: { dryRun?: boolean; force?: boolean }
): Promise<{ matched: number; total: number; matches: Array<{ schemeName: string; amfiCode: string }> }> {
  if (options?.force && !options?.dryRun) {
    await db.runAsync(`UPDATE investment_schemes SET amfi_code = NULL`);
    console.log('[amfiMatcher] force=true — cleared all existing AMFI codes');
  }


  const unmatched = await getUnmatchedSchemes(db);
  console.log(`[amfiMatcher] ${unmatched.length} schemes to match`);

  const matches: Array<{ schemeName: string; amfiCode: string }> = [];

  for (const scheme of unmatched) {

    const amfiCode = await findBestMatch(scheme.scheme_name, scheme.amc_name);

    if (amfiCode) {
      matches.push({ schemeName: scheme.scheme_name, amfiCode });

      if (!options?.dryRun) {
        await updateSchemeAmfiCode(db, scheme.id, amfiCode);
        console.log(`[amfiMatcher] Updated scheme ${scheme.id} with AMFI code ${amfiCode}`);
      } else {
        console.log(`[amfiMatcher] (dry run) Would update scheme ${scheme.id} with AMFI code ${amfiCode}`);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return {
    matched: matches.length,
    total: unmatched.length,
    matches,
  };
}

/**
 * Check if a specific scheme has NAV data available
 */
export async function verifySchemeNAV(amfiCode: string): Promise<boolean> {
  try {
    const info = await getSchemeInfo(amfiCode);
    return info !== null;
  } catch {
    return false;
  }
}
