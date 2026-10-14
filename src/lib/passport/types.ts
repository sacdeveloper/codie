import type { MrzResult } from "./mrz";

export const PASSPORT_FIELD_KEYS = [
  "surname",
  "givenNames",
  "fullName",
  "passportNumber",
  "dateOfBirth",
  "sex",
  "nationality",
  "placeOfIssue",
  "issuingAuthority",
  "dateOfIssue",
  "dateOfExpiry",
] as const;
export type PassportFieldKey = (typeof PASSPORT_FIELD_KEYS)[number];

/** A value read by the OCR provider from the visual inspection zone (VIZ) of the page. */
export interface RawProviderField {
  value: string | null;
  confidence: number | null; // 0..1 when the provider reports it
}

export interface RawProviderResult {
  provider: string;
  isMock: boolean;
  fields: Partial<Record<Exclude<PassportFieldKey, "fullName"> | "nationalityCode", RawProviderField>>;
  /** MRZ text as returned by the provider, if any (two lines separated by a newline). */
  mrzText: string | null;
  /** Full OCR text; used only transiently to locate an MRZ, never persisted. */
  fullText?: string | null;
}

export type FieldSource = "viz" | "mrz" | "viz+mrz" | "derived" | "none";

export interface ExtractedField {
  value: string | null;
  confidence: number | null;
  source: FieldSource;
  needsReview: boolean;
  reason?: string;
}

export interface PassportExtraction {
  provider: string;
  isMock: boolean;
  fields: Record<PassportFieldKey, ExtractedField>;
  mrz: Pick<MrzResult, "format" | "valid" | "checks" | "issuingState"> | null;
  warnings: string[];
}

export interface PassportOcrInput {
  bytes: Uint8Array;
  mimeType: string;
  signal?: AbortSignal;
}

export interface PassportOcrProvider {
  readonly name: string;
  readonly isMock: boolean;
  extract(input: PassportOcrInput): Promise<RawProviderResult>;
}

export class OcrError extends Error {
  constructor(
    message: string,
    public readonly code: "not_configured" | "provider_error" | "timeout" | "unsupported" | "cancelled" | "no_document",
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "OcrError";
  }
}
