import { describe, expect, it } from "vitest";
import { buildTd3Mrz, checkDigit, findMrzLines, parseMrz } from "@/lib/passport/mrz";

// ICAO Doc 9303 specimen (Part 4, Appendix A)
const ICAO_L1 = "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<";
const ICAO_L2 = "L898902C36UTO7408122F1204159ZE184226B<<<<<10";
const NOW = new Date("2026-10-14T00:00:00Z");

describe("MRZ", () => {
  it("computes ICAO check digits", () => {
    expect(checkDigit("L898902C3")).toBe(6);
    expect(checkDigit("740812")).toBe(2);
    expect(checkDigit("120415")).toBe(9);
  });

  it("parses the ICAO TD3 specimen and validates every check digit", () => {
    const r = parseMrz([ICAO_L1, ICAO_L2], NOW)!;
    expect(r.format).toBe("TD3");
    expect(r.surname).toBe("ERIKSSON");
    expect(r.givenNames).toBe("ANNA MARIA");
    expect(r.documentNumber).toBe("L898902C3");
    expect(r.nationality).toBe("UTO");
    expect(r.dateOfBirth).toBe("1974-08-12");
    expect(r.sex).toBe("F");
    expect(r.dateOfExpiry).toBe("2012-04-15");
    expect(r.valid).toBe(true);
  });

  it("detects a corrupted document number", () => {
    const bad = ICAO_L2.replace("L898902C3", "L898902C8");
    const r = parseMrz([ICAO_L1, bad], NOW)!;
    expect(r.valid).toBe(false);
    expect(r.checks.find((c) => c.field === "documentNumber")?.valid).toBe(false);
  });

  it("finds MRZ lines inside noisy OCR text and tolerates spaces/« characters", () => {
    const text = `REPUBLIC OF UTOPIA\nPassport No L898902C3\n${ICAO_L1.replace(/<</g, "« ")}\n${ICAO_L2.slice(0, 20)} ${ICAO_L2.slice(20)}\n`;
    expect(findMrzLines(text)).not.toBeNull();
    const r = parseMrz(text, NOW)!;
    expect(r.documentNumber).toBe("L898902C3");
  });

  it("corrects common OCR confusions in numeric positions", () => {
    const noisy = ICAO_L2.replace("7408122", "74O8l22".toUpperCase());
    const r = parseMrz([ICAO_L1, noisy], NOW)!;
    expect(r.dateOfBirth).toBe("1974-08-12");
  });

  it("round-trips a generated MRZ", () => {
    const lines = buildTd3Mrz({ issuingState: "IND", surname: "SAMPLE", givenNames: "ARUN KUMAR", documentNumber: "Z1234567", nationality: "IND", dob: "950101", sex: "M", expiry: "300114" });
    const r = parseMrz(lines, NOW)!;
    expect(r.valid).toBe(true);
    expect(r.dateOfBirth).toBe("1995-01-01");
    expect(r.dateOfExpiry).toBe("2030-01-14");
    expect(r.givenNames).toBe("ARUN KUMAR");
  });

  it("returns null when no MRZ is present", () => {
    expect(parseMrz("no machine readable zone here", NOW)).toBeNull();
  });
});
