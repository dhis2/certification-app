import { ControlType, ControlGroup } from '../../../common/enums';

export interface CriterionDefinition {
  code: string;
  name: string;
  description?: string;
  verificationMethod?: string;
  guidance?: string;
  justification?: string | null;
  controlType: ControlType | 'technical' | 'organizational';
  controlGroup?: ControlGroup | 'DSCP1';
  isMandatory?: boolean;
  isCriticalFail?: boolean;
  evidenceRequired?: boolean;
  evidenceDescription?: string;
  cisMapping?: string | null;
  verificationCommands?: string | null;
  score?: number | null;
  notes?: string | null;
  weight?: number;
  minPassingScore?: number;
  maxScore?: number;
}

export interface CategoryDefinition {
  name: string;
  description?: string;
  weight: number;
  sortOrder: number;
  criteria: CriterionDefinition[];
}

export interface ComplianceStatusScoringDefinition {
  compliant: number;
  partially_compliant: number;
  non_compliant: number;
  not_applicable: number | null;
  not_tested: number;
}

export interface TemplateDefinition {
  name: string;
  version: number;
  description?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  categories: CategoryDefinition[];
  complianceStatusScoring?: ComplianceStatusScoringDefinition;
}

export interface TemplateValidationError {
  path: string;
  message: string;
  keyword?: string;
}

export interface TemplateValidationResult {
  valid: boolean;
  errors: TemplateValidationError[];
}

export interface TemplateSyncResult {
  created: boolean;
  updated: boolean;
  templateId: string;
  name: string;
  version: number;
  categoriesCount: number;
  criteriaCount: number;
}

export interface TemplateDiffItem {
  type: 'added' | 'removed' | 'modified';
  path: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface TemplateDiff {
  fromVersion: number;
  toVersion: number;
  changes: TemplateDiffItem[];
}
