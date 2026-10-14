import type { Role } from "@/lib/auth/roles";

export type ReportStatus = "draft" | "pending_review" | "completed" | "revoked" | "superseded";
export type VerificationStatus = "not_issued" | "valid" | "revoked" | "superseded";
export type OcrStatus = "uploaded" | "processing" | "succeeded" | "failed" | "cancelled" | "manual";

export interface OrganisationRow {
  id: string;
  name: string;
  declaration_name: string | null;
  registration_number: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  accreditation_details: string | null;
  footer_lines: string[];
  logo_path: string | null;
  letterhead_path: string | null;
  signature_image_path: string | null;
  seal_image_path: string | null;
  settings: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
  organisation_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReportRow {
  id: string;
  organisation_id: string;
  serial_number: string;
  revision_number: number;
  revision_of: string | null;
  superseded_by: string | null;
  report_date: string;
  valid_until: string | null;
  status: ReportStatus;
  report_details: Record<string, unknown>;
  examinee_details: Record<string, unknown>;
  medical_history: Record<string, unknown>;
  medical_examination: Record<string, unknown>;
  laboratory_results: Record<string, unknown>;
  remarks: string | null;
  examinee_full_name: string | null;
  passport_number: string | null;
  position_applied_for: string | null;
  photo_path: string | null;
  identity_source: "passport_ocr" | "manual" | null;
  identity_confirmed_at: string | null;
  identity_confirmed_by: string | null;
  template_id: string | null;
  template_version: number;
  issued_snapshot: IssuedSnapshot | null;
  verification_token_hash: string | null;
  verification_nonce: string | null;
  verification_status: VerificationStatus;
  client_request_id: string | null;
  issuing_started_at: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  approved_by: string | null;
  revoked_reason: string | null;
  archived_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  revoked_at: string | null;
}

export interface RegistryRow {
  id: string;
  serial_number: string;
  revision_number: number;
  report_date: string;
  valid_until: string | null;
  status: ReportStatus;
  verification_status: VerificationStatus;
  examinee_full_name: string | null;
  passport_masked: string | null;
  position_applied_for: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  archived_at: string | null;
  revision_of: string | null;
  superseded_by: string | null;
}

export interface TemplateRow {
  id: string;
  organisation_id: string;
  name: string;
  version: number;
  field_configuration: unknown;
  letterhead_configuration: unknown;
  layout_configuration: unknown;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PassportDocumentRow {
  id: string;
  report_id: string;
  organisation_id: string;
  kind: "passport" | "photo";
  storage_path: string;
  original_filename: string | null;
  mime_type: string;
  file_size: number;
  content_hash: string | null;
  ocr_status: OcrStatus;
  ocr_provider: string | null;
  is_mock: boolean;
  extraction_data: unknown;
  confidence_data: unknown;
  reviewed_data: unknown;
  error_message: string | null;
  uploaded_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface ReportFileRow {
  id: string;
  report_id: string;
  organisation_id: string;
  file_type: "report_pdf";
  version: number;
  storage_path: string;
  content_hash: string;
  file_size: number;
  page_count: number;
  layout_mode: "single" | "continuation";
  template_version: number;
  generated_at: string;
  generated_by: string | null;
}

export interface AuditLogRow {
  id: string;
  organisation_id: string | null;
  actor_id: string | null;
  report_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Frozen at issue so that regenerated PDFs are byte-for-byte reproducible in content. */
export interface IssuedSnapshot {
  printTemplateVersion: string;
  organisation: {
    name: string;
    declarationName: string;
    registrationNumber: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    accreditationDetails: string | null;
    footerLines: string[];
  };
  assets: { logo: string | null; letterhead: string | null; signature: string | null; seal: string | null; photo: string | null };
  template: {
    id: string | null;
    name: string;
    version: number;
    fieldConfiguration: unknown;
    letterheadConfiguration: unknown;
    layoutConfiguration: unknown;
  };
  layoutMode: "single" | "continuation";
}
