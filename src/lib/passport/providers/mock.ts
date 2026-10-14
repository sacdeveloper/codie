import { buildTd3Mrz } from "../mrz";
import { OcrError, type PassportOcrInput, type PassportOcrProvider, type RawProviderResult } from "../types";

/**
 * DEVELOPMENT ONLY. Does not read the uploaded document. Returns an obviously fictitious
 * specimen identity (ICAO "UTOPIA" specimen style) so the review workflow can be exercised
 * without OCR credentials. The UI labels results from this provider as mock data.
 */
export class MockPassportOcrProvider implements PassportOcrProvider {
  readonly name = "mock";
  readonly isMock = true;

  constructor(private readonly mode: "specimen" | "fail" = "specimen", private readonly delayMs = 400) {}

  async extract(input: PassportOcrInput): Promise<RawProviderResult> {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, this.delayMs);
      input.signal?.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new OcrError("OCR was cancelled.", "cancelled", true));
      });
    });
    if (this.mode === "fail") {
      throw new OcrError("Mock OCR provider configured to fail (OCR_MOCK_MODE=fail).", "provider_error", true);
    }
    const [l1, l2] = buildTd3Mrz({
      issuingState: "UTO",
      surname: "SPECIMEN",
      givenNames: "MOCK DATA",
      documentNumber: "MOCK00000",
      nationality: "UTO",
      dob: "900101",
      sex: "M",
      expiry: "350101",
    });
    return {
      provider: this.name,
      isMock: true,
      fields: {
        surname: { value: "SPECIMEN", confidence: 0.9 },
        givenNames: { value: "MOCK DATA", confidence: 0.9 },
        passportNumber: { value: "MOCK00000", confidence: 0.9 },
        dateOfBirth: { value: "1990-01-01", confidence: 0.9 },
        sex: { value: "M", confidence: 0.9 },
        // Deliberately low confidence so the review highlighting can be seen.
        dateOfIssue: { value: "2025-01-02", confidence: 0.6 },
        dateOfExpiry: { value: "2035-01-01", confidence: 0.9 },
      },
      mrzText: `${l1}\n${l2}`,
    };
  }
}
