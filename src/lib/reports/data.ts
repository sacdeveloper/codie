import type { ReportData, SectionKey } from "@/lib/template/types";
import type { ReportRow } from "@/lib/supabase/types";

/** Maps report sections to their database columns. */
export const SECTION_COLUMNS = {
  report: "report_details",
  examinee: "examinee_details",
  history: "medical_history",
  examination: "medical_examination",
  laboratory: "laboratory_results",
} as const satisfies Partial<Record<SectionKey, keyof ReportRow>>;

export function reportRowToData(row: Pick<ReportRow, "report_details" | "examinee_details" | "medical_history" | "medical_examination" | "laboratory_results" | "remarks">): ReportData {
  return {
    report: (row.report_details ?? {}) as ReportData["report"],
    examinee: (row.examinee_details ?? {}) as ReportData["examinee"],
    history: (row.medical_history ?? {}) as ReportData["history"],
    examination: (row.medical_examination ?? {}) as ReportData["examination"],
    laboratory: (row.laboratory_results ?? {}) as ReportData["laboratory"],
    remarks: { remarks: row.remarks ?? null },
  };
}

export function dataToReportColumns(data: ReportData) {
  return {
    report_details: data.report,
    examinee_details: data.examinee,
    medical_history: data.history,
    medical_examination: data.examination,
    laboratory_results: data.laboratory,
    remarks: (data.remarks.remarks as string | null) ?? null,
  };
}

export const STATUS_LABELS: Record<ReportRow["status"], string> = {
  draft: "Draft",
  pending_review: "Pending review",
  completed: "Completed",
  revoked: "Revoked",
  superseded: "Superseded",
};

export const VERIFICATION_LABELS: Record<ReportRow["verification_status"], string> = {
  not_issued: "Not issued",
  valid: "Valid",
  revoked: "Revoked",
  superseded: "Superseded",
};
