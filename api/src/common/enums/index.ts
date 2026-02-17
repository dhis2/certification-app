export enum UserRole {
  ADMIN = 'admin',
  ASSESSOR = 'assessor',
  USER = 'user',
}

export enum ControlGroup {
  DSCP1 = 'DSCP1',
}

export enum ControlType {
  TECHNICAL = 'technical',
  ORGANIZATIONAL = 'organizational',
}

export enum ComplianceStatus {
  COMPLIANT = 'compliant',
  PARTIALLY_COMPLIANT = 'partially_compliant',
  NON_COMPLIANT = 'non_compliant',
  NOT_APPLICABLE = 'not_applicable',
  NOT_TESTED = 'not_tested',
}

export enum SubmissionStatus {
  DRAFT = 'draft',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  PASSED = 'passed',
  FAILED = 'failed',
  WITHDRAWN = 'withdrawn',
}

export enum CertificationResult {
  PASS = 'pass',
  FAIL = 'fail',
}
