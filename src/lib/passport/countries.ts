/**
 * ICAO 9303 nationality codes -> nationality as typically printed on the report.
 * Unknown codes are returned as-is and flagged for manual review by the mapper.
 */
export const NATIONALITY_BY_CODE: Record<string, string> = {
  AFG: "AFGHAN", ARE: "EMIRATI", ARG: "ARGENTINE", AUS: "AUSTRALIAN", AUT: "AUSTRIAN", BGD: "BANGLADESHI",
  BEL: "BELGIAN", BHR: "BAHRAINI", BRA: "BRAZILIAN", BTN: "BHUTANESE", CAN: "CANADIAN", CHE: "SWISS",
  CHN: "CHINESE", CMR: "CAMEROONIAN", COD: "CONGOLESE", DEU: "GERMAN", D: "GERMAN", DNK: "DANISH", EGY: "EGYPTIAN",
  ERI: "ERITREAN", ESP: "SPANISH", ETH: "ETHIOPIAN", FIN: "FINNISH", FRA: "FRENCH", GBR: "BRITISH",
  GHA: "GHANAIAN", GRC: "GREEK", IDN: "INDONESIAN", IND: "INDIAN", IRL: "IRISH", IRN: "IRANIAN", IRQ: "IRAQI",
  ITA: "ITALIAN", JOR: "JORDANIAN", JPN: "JAPANESE", KEN: "KENYAN", KHM: "CAMBODIAN", KOR: "SOUTH KOREAN",
  KWT: "KUWAITI", LBN: "LEBANESE", LKA: "SRI LANKAN", MAR: "MOROCCAN", MDG: "MALAGASY", MDV: "MALDIVIAN",
  MEX: "MEXICAN", MMR: "MYANMAR", MYS: "MALAYSIAN", NGA: "NIGERIAN", NLD: "DUTCH", NOR: "NORWEGIAN",
  NPL: "NEPALESE", NZL: "NEW ZEALANDER", OMN: "OMANI", PAK: "PAKISTANI", PHL: "FILIPINO", POL: "POLISH",
  PRT: "PORTUGUESE", QAT: "QATARI", ROU: "ROMANIAN", RUS: "RUSSIAN", RWA: "RWANDAN", SAU: "SAUDI",
  SDN: "SUDANESE", SEN: "SENEGALESE", SLE: "SIERRA LEONEAN", SOM: "SOMALI", SWE: "SWEDISH", SYR: "SYRIAN",
  THA: "THAI", TUN: "TUNISIAN", TUR: "TURKISH", TZA: "TANZANIAN", UGA: "UGANDAN", UKR: "UKRAINIAN",
  USA: "AMERICAN", UZB: "UZBEK", VNM: "VIETNAMESE", YEM: "YEMENI", ZAF: "SOUTH AFRICAN", ZMB: "ZAMBIAN",
  ZWE: "ZIMBABWEAN",
};

export function nationalityFromCode(code: string | null | undefined): { value: string | null; known: boolean } {
  if (!code) return { value: null, known: false };
  const c = code.replace(/</g, "").trim().toUpperCase();
  if (!c) return { value: null, known: false };
  const n = NATIONALITY_BY_CODE[c];
  return n ? { value: n, known: true } : { value: c, known: false };
}
