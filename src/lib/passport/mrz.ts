/**
 * ICAO 9303 machine-readable zone parser for passports (TD3, 2x44) and TD2 (2x36) documents.
 * Validates every check digit so that OCR errors are surfaced for review instead of trusted.
 */

export interface MrzCheck {
  field: "documentNumber" | "dateOfBirth" | "dateOfExpiry" | "personalNumber" | "composite";
  valid: boolean;
}

export interface MrzResult {
  format: "TD3" | "TD2";
  documentCode: string;
  issuingState: string;
  surname: string;
  givenNames: string;
  documentNumber: string;
  nationality: string;
  dateOfBirth: string | null; // ISO yyyy-mm-dd
  sex: "M" | "F" | null; // null for "<" / "X" (unspecified)
  dateOfExpiry: string | null;
  personalNumber: string;
  checks: MrzCheck[];
  valid: boolean;
  lines: [string, string];
}

const WEIGHTS = [7, 3, 1];

function charValue(c: string): number {
  if (c === "<") return 0;
  if (c >= "0" && c <= "9") return c.charCodeAt(0) - 48;
  if (c >= "A" && c <= "Z") return c.charCodeAt(0) - 55;
  return -1;
}

export function checkDigit(input: string): number {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    const v = charValue(input[i]);
    if (v < 0) return -1;
    sum += v * WEIGHTS[i % 3];
  }
  return sum % 10;
}

function verify(value: string, digit: string): boolean {
  // A filler "<" check digit is permitted for an entirely empty optional field.
  if (digit === "<") return /^<*$/.test(value);
  return checkDigit(value) === Number(digit);
}

/** Common OCR confusions in positions that must be numeric. */
function fixNumeric(s: string): string {
  return s.replace(/[OQD]/g, "0").replace(/[IL]/g, "1").replace(/Z/g, "2").replace(/S/g, "5").replace(/B/g, "8").replace(/G/g, "6");
}

function parseDate(yymmdd: string, kind: "birth" | "expiry", now = new Date()): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  const currentYY = now.getUTCFullYear() % 100;
  const century = kind === "birth" ? (yy > currentYY ? 1900 : 2000) : yy >= 70 ? 1900 : 2000;
  const year = century + yy;
  const d = new Date(Date.UTC(year, mm - 1, dd));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null;
  return d.toISOString().slice(0, 10);
}

function parseNames(field: string): { surname: string; givenNames: string } {
  const [surnamePart, ...rest] = field.split("<<");
  const surname = surnamePart.replace(/</g, " ").trim();
  const givenNames = rest.join(" ").replace(/</g, " ").replace(/\s+/g, " ").trim();
  return { surname, givenNames };
}

export function normaliseMrzLine(line: string): string {
  return line
    .toUpperCase()
    .replace(/«/g, "<<") // OCR commonly reads a double filler "<<" as a guillemet
    .replace(/[‹＜]/g, "<")
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9<]/g, "");
}

/** Finds two consecutive MRZ-like lines in arbitrary OCR text. */
export function findMrzLines(text: string): [string, string] | null {
  const candidates = text
    .split(/\r?\n/)
    .map(normaliseMrzLine)
    .filter((l) => l.length >= 30 && l.includes("<"));
  for (let i = candidates.length - 2; i >= 0; i--) {
    const a = candidates[i];
    const b = candidates[i + 1];
    if (/^[PIACV]/.test(a) && Math.abs(a.length - b.length) <= 2) return [a, b];
  }
  return null;
}

export function parseMrz(input: string | [string, string], now = new Date()): MrzResult | null {
  const lines = typeof input === "string" ? findMrzLines(input) : [normaliseMrzLine(input[0]), normaliseMrzLine(input[1])];
  if (!lines) return null;
  let [l1, l2] = lines as [string, string];
  const len = l1.length >= 40 || l2.length >= 40 ? 44 : 36;
  l1 = l1.padEnd(len, "<").slice(0, len);
  l2 = l2.padEnd(len, "<").slice(0, len);
  const format = len === 44 ? "TD3" : "TD2";

  const documentCode = l1.slice(0, 2).replace(/</g, "");
  const issuingState = l1.slice(2, 5).replace(/</g, "");
  const { surname, givenNames } = parseNames(l1.slice(5));

  const docNumRaw = l2.slice(0, 9);
  const docCheck = fixNumeric(l2[9]).replace(/[^0-9<]/, "<");
  const nationality = l2.slice(10, 13).replace(/</g, "");
  const dob = fixNumeric(l2.slice(13, 19));
  const dobCheck = fixNumeric(l2[19]);
  const sexChar = l2[20];
  const exp = fixNumeric(l2.slice(21, 27));
  const expCheck = fixNumeric(l2[27]);

  const checks: MrzCheck[] = [
    { field: "documentNumber", valid: verify(docNumRaw, docCheck) },
    { field: "dateOfBirth", valid: verify(dob, dobCheck) },
    { field: "dateOfExpiry", valid: verify(exp, expCheck) },
  ];

  let personalNumber = "";
  if (format === "TD3") {
    const personal = l2.slice(28, 42);
    personalNumber = personal.replace(/</g, "");
    checks.push({ field: "personalNumber", valid: verify(personal, l2[42]) });
    const composite = docNumRaw + docCheck + dob + dobCheck + exp + expCheck + personal + l2[42];
    checks.push({ field: "composite", valid: verify(composite, fixNumeric(l2[43])) });
  } else {
    const optional = l2.slice(28, 35);
    personalNumber = optional.replace(/</g, "");
    const composite = docNumRaw + docCheck + dob + dobCheck + exp + expCheck + optional;
    checks.push({ field: "composite", valid: verify(composite, fixNumeric(l2[35])) });
  }

  return {
    format,
    documentCode,
    issuingState,
    surname,
    givenNames,
    documentNumber: docNumRaw.replace(/</g, ""),
    nationality,
    dateOfBirth: parseDate(dob, "birth", now),
    sex: sexChar === "M" ? "M" : sexChar === "F" ? "F" : null,
    dateOfExpiry: parseDate(exp, "expiry", now),
    personalNumber,
    checks,
    valid: checks.every((c) => c.valid),
    lines: [l1, l2],
  };
}

/** Builds a TD3 MRZ (used for test fixtures and the development mock provider). */
export function buildTd3Mrz(p: {
  issuingState: string;
  surname: string;
  givenNames: string;
  documentNumber: string;
  nationality: string;
  dob: string; // YYMMDD
  sex: "M" | "F" | "<";
  expiry: string; // YYMMDD
  personalNumber?: string;
}): [string, string] {
  const name = `${p.surname.replace(/ /g, "<")}<<${p.givenNames.replace(/ /g, "<")}`;
  const l1 = `P<${p.issuingState}${name}`.padEnd(44, "<").slice(0, 44);
  const doc = p.documentNumber.padEnd(9, "<").slice(0, 9);
  const personal = (p.personalNumber ?? "").padEnd(14, "<").slice(0, 14);
  const docC = String(checkDigit(doc));
  const dobC = String(checkDigit(p.dob));
  const expC = String(checkDigit(p.expiry));
  const persC = /^<*$/.test(personal) ? "<" : String(checkDigit(personal));
  const composite = String(checkDigit(doc + docC + p.dob + dobC + p.expiry + expC + personal + persC));
  const l2 = `${doc}${docC}${p.nationality}${p.dob}${dobC}${p.sex}${p.expiry}${expC}${personal}${persC}${composite}`;
  return [l1, l2];
}
