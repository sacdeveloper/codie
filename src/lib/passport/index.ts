import "server-only";
import { serverEnv } from "@/lib/env";
import { AzurePassportOcrProvider } from "./providers/azure";
import { MockPassportOcrProvider } from "./providers/mock";
import { OcrError, type PassportOcrProvider } from "./types";

/** Selects the configured OCR provider. Credentials are read server-side only. */
export function getPassportOcrProvider(): PassportOcrProvider {
  const env = serverEnv();
  switch (env.OCR_PROVIDER) {
    case "azure":
      return new AzurePassportOcrProvider({
        endpoint: env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT ?? "",
        apiKey: env.AZURE_DOCUMENT_INTELLIGENCE_KEY ?? "",
        apiVersion: env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION,
      });
    case "mock":
      if (env.NODE_ENV === "production" && !env.ALLOW_MOCK_OCR_IN_PRODUCTION) {
        throw new OcrError("Mock OCR is disabled in production. Configure a real OCR provider.", "not_configured", false);
      }
      return new MockPassportOcrProvider(env.OCR_MOCK_MODE);
    default:
      throw new OcrError("No OCR provider configured.", "not_configured", false);
  }
}

export * from "./types";
export * from "./extraction";
