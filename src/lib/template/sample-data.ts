/**
 * SAMPLE / DEMONSTRATION DATA ONLY — a fictitious examinee used for layout tests and template previews.
 * The result values mirror the shape of the reference report; the identity is invented.
 * Never used to pre-populate real reports.
 */
import type { ReportData } from "@/lib/template/types";
import type { OrganisationSnapshot, ReportMeta } from "@/lib/pdf/render-html";

export const SAMPLE_REPORT_DATA: ReportData = {
  report: { destination: "QATAR" },
  examinee: {
    name_title: "Mr.", full_name: "ARUN KUMAR SAMPLE", height_cm: 170, weight_kg: 68, sex: "MALE",
    marital_status: "SINGLE", date_of_birth: "1995-01-01", nationality: "INDIAN", passport_number: "Z 1234567",
    place_of_issue: "CHENNAI", date_of_issue: "2020-01-15", date_of_expiry: null, position_applied_for: "MECHANICAL FITTER",
  },
  history: { psychiatric_neurological: "NIL", allergy: "NIL", others: "NIL" },
  examination: {
    right_eye: "NAD 6/6", left_eye: "NAD 6/6", right_ear: "NAD", left_ear: "NAD", cardiovascular: "NORMAL",
    blood_pressure: "120/80/68", heart: "NAD", lungs: "NAD", chest_xray: "NORMAL", abdomen: "NAD", hernia: "NIL",
    varicose_veins: "NIL", extremities: "NAD", deformities: "NIL", skin: "NAD", clinical: "NAD",
  },
  laboratory: {
    urine_sugar: "ABSENT", urine_albumin: "ABSENT", stool_routine: "NAD", helminthes: "NIL", giardia: "ABSENT",
    salmonella: "ABSENT", shigella: "ABSENT", v_cholera: null, hemoglobin: 14.6, malaria: "NOT SEEN", micro_filaria: "NOT SEEN",
    blood_group: "O + VE", blood_sugar: 84, lft: "NORMAL", creatinine: 0.89, urea: 21, hiv: "NEGATIVE", hbsag: "NEGATIVE",
    anti_hcv: "NEGATIVE", vdrl: "NEGATIVE", tpha: "NEGATIVE", pregnancy_test: null, lmp: null,
  },
  remarks: { remarks: "*NO ABNORMALITY DETECTED*  INCLUDING TUBERCULOSIS" },
};

export const SAMPLE_META: ReportMeta = {
  serialNumber: "R-7", reportDate: "2026-07-28", validUntil: "2027-07-27", revisionNumber: 1, templateVersion: 1,
};

export const SAMPLE_ORG: OrganisationSnapshot = {
  name: "SAMPLE MEDICAL CENTRE",
  declarationName: "SAMPLE DIAGNOSTIC CENTRE",
  registrationNumber: "TN 00/0000",
  address: "1 Sample Road\nSample City 000 000",
  phone: "00000-000000",
  email: "info@example.com",
  website: "www.example.com",
  accreditationDetails: "An ISO 9001 : 2015 Accredited Medical Centre",
  footerLines: ["www.example.com", "Mail ID: info@example.com", "reports@example.com"],
};
