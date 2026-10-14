import { describe, expect, it } from "vitest";
import { buildTd3Mrz } from "@/lib/passport/mrz";
import { mapPassportFieldsToReport, validateExtraction, extractionToValues } from "@/lib/passport/extraction";
import { MockPassportOcrProvider } from "@/lib/passport/providers/mock";
import { AzurePassportOcrProvider } from "@/lib/passport/providers/azure";
import type { RawProviderResult } from "@/lib/passport/types";

const mrz = buildTd3Mrz({ issuingState: "IND", surname: "SAMPLE", givenNames: "ARUN KUMAR", documentNumber: "Z1234567", nationality: "IND", dob: "950101", sex: "M", expiry: "300114" });
const NOW = new Date("2026-10-14T00:00:00Z");

const raw = (over: Partial<RawProviderResult> = {}): RawProviderResult => ({
  provider: "test",
  isMock: false,
  fields: {
    surname: { value: "SAMPLE", confidence: 0.97 },
    givenNames: { value: "ARUN KUMAR", confidence: 0.96 },
    passportNumber: { value: "Z1234567", confidence: 0.95 },
    dateOfBirth: { value: "1995-01-01", confidence: 0.98 },
    sex: { value: "M", confidence: 0.99 },
    nationalityCode: { value: "IND", confidence: 0.99 },
    dateOfIssue: { value: "2020-01-15", confidence: 0.93 },
    dateOfExpiry: { value: "2030-01-14", confidence: 0.94 },
    placeOfIssue: { value: "CHENNAI", confidence: 0.92 },
  },
  mrzText: mrz.join("\n"),
  ...over,
});

describe("validateExtraction", () => {
  it("cross-checks printed values against a valid MRZ", () => {
    const e = validateExtraction(raw(), NOW);
    expect(e.fields.passportNumber).toMatchObject({ value: "Z1234567", source: "viz+mrz", needsReview: false });
    expect(e.fields.dateOfBirth).toMatchObject({ value: "1995-01-01", needsReview: false });
    expect(e.fields.sex.value).toBe("MALE");
    expect(e.fields.nationality.value).toBe("INDIAN");
    expect(e.mrz?.valid).toBe(true);
  });

  it("flags disagreement between printed text and MRZ instead of resolving silently", () => {
    const r = raw();
    r.fields.passportNumber = { value: "Z1234560", confidence: 0.99 };
    const e = validateExtraction(r, NOW);
    expect(e.fields.passportNumber.needsReview).toBe(true);
    expect(e.fields.passportNumber.value).toBe("Z1234567"); // check-digit protected MRZ preferred
    expect(e.fields.passportNumber.reason).toMatch(/disagree/);
  });

  it("marks low-confidence values for review", () => {
    const r = raw({ mrzText: null });
    r.fields.dateOfIssue = { value: "2020-01-15", confidence: 0.4 };
    const e = validateExtraction(r, NOW);
    expect(e.fields.dateOfIssue).toMatchObject({ needsReview: true, reason: "Low OCR confidence." });
    expect(e.warnings.join(" ")).toMatch(/No machine-readable zone/);
  });

  it("leaves missing fields empty and never invents data", () => {
    const e = validateExtraction({ provider: "t", isMock: false, fields: {}, mrzText: null }, NOW);
    for (const f of Object.values(e.fields)) {
      expect(f.value).toBeNull();
      expect(f.needsReview).toBe(true);
    }
  });

  it("never maps issuing authority onto place of issue", () => {
    const r = raw();
    delete r.fields.placeOfIssue;
    r.fields.issuingAuthority = { value: "MINISTRY OF EXTERNAL AFFAIRS", confidence: 0.9 };
    const e = validateExtraction(r, NOW);
    expect(e.fields.placeOfIssue.value).toBeNull();
    expect(e.fields.issuingAuthority.value).toBe("MINISTRY OF EXTERNAL AFFAIRS");
    const mapped = mapPassportFieldsToReport(extractionToValues(e));
    expect(mapped.place_of_issue).toBeUndefined();
  });

  it("always asks for review of a composed full name and of the place of issue", () => {
    const e = validateExtraction(raw(), NOW);
    expect(e.fields.fullName).toMatchObject({ value: "ARUN KUMAR SAMPLE", needsReview: true });
    expect(e.fields.placeOfIssue.needsReview).toBe(true);
  });

  it("drops unparseable dates", () => {
    const r = raw({ mrzText: null });
    r.fields.dateOfIssue = { value: "28 OCT 19", confidence: 0.99 };
    const e = validateExtraction(r, NOW);
    expect(e.fields.dateOfIssue.value).toBeNull();
    expect(e.fields.dateOfIssue.needsReview).toBe(true);
  });

  it("flags unknown nationality codes", () => {
    const r = raw({ mrzText: null });
    r.fields.nationalityCode = { value: "ZZZ", confidence: 0.99 };
    const e = validateExtraction(r, NOW);
    expect(e.fields.nationality).toMatchObject({ value: "ZZZ", needsReview: true });
  });
});

describe("mapPassportFieldsToReport", () => {
  it("preserves the passport number exactly as printed", () => {
    const m = mapPassportFieldsToReport({ passportNumber: "Z 1234567", fullName: "ARUN KUMAR SAMPLE", sex: "F", dateOfBirth: "1995-01-01" });
    expect(m).toEqual({ passport_number: "Z 1234567", full_name: "ARUN KUMAR SAMPLE", sex: "FEMALE", date_of_birth: "1995-01-01" });
  });
});

describe("providers", () => {
  it("mock provider labels its output as mock", async () => {
    const e = validateExtraction(await new MockPassportOcrProvider("specimen", 0).extract({ bytes: new Uint8Array([1]), mimeType: "image/png" }));
    expect(e.isMock).toBe(true);
    expect(e.fields.surname.value).toBe("SPECIMEN");
  });

  it("mock provider can simulate failure", async () => {
    await expect(new MockPassportOcrProvider("fail", 0).extract({ bytes: new Uint8Array([1]), mimeType: "image/png" })).rejects.toThrow(/fail/);
  });

  it("azure provider maps prebuilt-idDocument fields", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      if (calls.length === 1) return new Response(null, { status: 202, headers: { "operation-location": "https://x/op/1" } });
      return Response.json({
        status: "succeeded",
        analyzeResult: {
          documents: [
            {
              docType: "idDocument.passport",
              fields: {
                LastName: { valueString: "SAMPLE", confidence: 0.98 },
                FirstName: { valueString: "ARUN KUMAR", confidence: 0.97 },
                DocumentNumber: { valueString: "Z1234567", confidence: 0.99 },
                DateOfBirth: { valueDate: "1995-01-01", confidence: 0.99 },
                Sex: { valueString: "M", confidence: 0.99 },
                Nationality: { valueCountryRegion: "IND", confidence: 0.99 },
                DateOfExpiration: { valueDate: "2030-01-14", confidence: 0.99 },
                MachineReadableZone: { content: mrz.join("\n"), confidence: 0.99 },
              },
            },
          ],
        },
      });
    }) as unknown as typeof fetch;
    const p = new AzurePassportOcrProvider({ endpoint: "https://x/", apiKey: "k", apiVersion: "2024-11-30", fetchImpl, pollIntervalMs: 1 });
    const e = validateExtraction(await p.extract({ bytes: new Uint8Array([1, 2]), mimeType: "image/jpeg" }), NOW);
    expect(calls[0]).toContain("prebuilt-idDocument:analyze");
    expect(e.isMock).toBe(false);
    expect(e.fields.passportNumber).toMatchObject({ value: "Z1234567", needsReview: false });
    expect(e.fields.nationality.value).toBe("INDIAN");
  });

  it("azure provider surfaces HTTP errors without leaking the response body", async () => {
    const fetchImpl = (async () => new Response("secret details", { status: 401 })) as unknown as typeof fetch;
    const p = new AzurePassportOcrProvider({ endpoint: "https://x", apiKey: "k", apiVersion: "v", fetchImpl });
    await expect(p.extract({ bytes: new Uint8Array([1]), mimeType: "image/png" })).rejects.toThrow(/HTTP 401/);
    await expect(p.extract({ bytes: new Uint8Array([1]), mimeType: "image/png" })).rejects.not.toThrow(/secret/);
  });
});
