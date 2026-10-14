import { OcrError, type PassportOcrInput, type PassportOcrProvider, type RawProviderField, type RawProviderResult } from "../types";

/**
 * Azure AI Document Intelligence — prebuilt "idDocument" model (passports, MRZ).
 * REST integration (no SDK) so credentials stay server-side and the dependency surface is small.
 * Docs: https://learn.microsoft.com/azure/ai-services/document-intelligence/prebuilt/id-document
 */
interface AzureField {
  type?: string;
  content?: string;
  confidence?: number;
  valueString?: string;
  valueDate?: string;
  valueCountryRegion?: string;
  valueObject?: Record<string, AzureField>;
}

interface AzureAnalyzeResult {
  status: "notStarted" | "running" | "succeeded" | "failed";
  error?: { code?: string; message?: string };
  analyzeResult?: {
    content?: string;
    documents?: Array<{ docType?: string; confidence?: number; fields?: Record<string, AzureField> }>;
  };
}

export interface AzureConfig {
  endpoint: string;
  apiKey: string;
  apiVersion: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  fetchImpl?: typeof fetch;
}

const val = (f: AzureField | undefined): RawProviderField | undefined => {
  if (!f) return undefined;
  const value = f.valueDate ?? f.valueString ?? f.valueCountryRegion ?? f.content ?? null;
  return { value: value ? String(value).trim() : null, confidence: typeof f.confidence === "number" ? f.confidence : null };
};

export class AzurePassportOcrProvider implements PassportOcrProvider {
  readonly name = "azure-document-intelligence";
  readonly isMock = false;

  constructor(private readonly config: AzureConfig) {
    if (!config.endpoint || !config.apiKey) {
      throw new OcrError("Azure Document Intelligence is not configured.", "not_configured", false);
    }
  }

  async extract(input: PassportOcrInput): Promise<RawProviderResult> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const base = this.config.endpoint.replace(/\/+$/, "");
    const url = `${base}/documentintelligence/documentModels/prebuilt-idDocument:analyze?api-version=${encodeURIComponent(this.config.apiVersion)}`;
    const timeoutMs = this.config.timeoutMs ?? 60_000;
    const started = Date.now();

    const headers = { "Ocp-Apim-Subscription-Key": this.config.apiKey, "Content-Type": "application/json" };
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ base64Source: Buffer.from(input.bytes).toString("base64") }),
        signal: input.signal,
      });
    } catch {
      if (input.signal?.aborted) throw new OcrError("OCR was cancelled.", "cancelled", true);
      throw new OcrError("Could not reach the OCR service.", "provider_error", true);
    }
    if (res.status !== 202) {
      // Do not echo provider bodies to the client; they can contain request details.
      throw new OcrError(`OCR service rejected the request (HTTP ${res.status}).`, "provider_error", res.status >= 500 || res.status === 429);
    }
    const opLocation = res.headers.get("operation-location");
    if (!opLocation) throw new OcrError("OCR service did not return an operation id.", "provider_error", true);

    let result: AzureAnalyzeResult | null = null;
    while (Date.now() - started < timeoutMs) {
      if (input.signal?.aborted) throw new OcrError("OCR was cancelled.", "cancelled", true);
      await new Promise((r) => setTimeout(r, this.config.pollIntervalMs ?? 1000));
      const poll = await fetchImpl(opLocation, { headers: { "Ocp-Apim-Subscription-Key": this.config.apiKey }, signal: input.signal });
      if (!poll.ok) throw new OcrError(`OCR status check failed (HTTP ${poll.status}).`, "provider_error", true);
      const body = (await poll.json()) as AzureAnalyzeResult;
      if (body.status === "succeeded") {
        result = body;
        break;
      }
      if (body.status === "failed") throw new OcrError("The OCR service could not analyse this document.", "provider_error", true);
    }
    if (!result) throw new OcrError("OCR timed out. Retry or enter the details manually.", "timeout", true);

    const doc = result.analyzeResult?.documents?.[0];
    if (!doc?.fields) throw new OcrError("No identity document was detected in the upload.", "no_document", false);
    const f = doc.fields;
    const mrzField = f.MachineReadableZone;

    return {
      provider: this.name,
      isMock: false,
      fields: {
        surname: val(f.LastName),
        givenNames: val(f.FirstName),
        passportNumber: val(f.DocumentNumber),
        dateOfBirth: val(f.DateOfBirth),
        sex: val(f.Sex),
        nationalityCode: val(f.Nationality),
        placeOfIssue: val(f.PlaceOfIssue),
        issuingAuthority: val(f.IssuingAuthority),
        dateOfIssue: val(f.DateOfIssue),
        dateOfExpiry: val(f.DateOfExpiration),
      },
      mrzText: mrzField?.content ?? null,
      fullText: result.analyzeResult?.content ?? null,
    };
  }
}
