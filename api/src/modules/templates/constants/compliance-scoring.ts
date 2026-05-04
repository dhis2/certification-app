/**
 * Canonical compliance status → numeric score mapping for assessment templates.
 * Keep in sync with seed files and OpenAPI; imported templates may omit this block
 * (server always attaches it on GET /templates/:id).
 */
export const COMPLIANCE_STATUS_SCORING = {
  compliant: 100,
  partially_compliant: 50,
  non_compliant: 0,
  not_applicable: null,
  not_tested: 0,
} as const;

export type ComplianceStatusScoring = {
  [K in keyof typeof COMPLIANCE_STATUS_SCORING]: (typeof COMPLIANCE_STATUS_SCORING)[K];
};

export function complianceScoringEquals(
  a: unknown,
): a is ComplianceStatusScoring {
  if (!a || typeof a !== 'object') return false;
  const r = a as Record<string, unknown>;
  return (
    r.compliant === COMPLIANCE_STATUS_SCORING.compliant &&
    r.partially_compliant === COMPLIANCE_STATUS_SCORING.partially_compliant &&
    r.non_compliant === COMPLIANCE_STATUS_SCORING.non_compliant &&
    r.not_applicable === COMPLIANCE_STATUS_SCORING.not_applicable &&
    r.not_tested === COMPLIANCE_STATUS_SCORING.not_tested
  );
}
