# Reference report field mapping

Generated from `src/lib/template/default-template.ts` (template v1) — do not edit by hand.
Source: the supplied scanned reference report ("MEDICAL REPORT — MEDICAL FOR QATAR"), not stored in the repository because it contains personal data.

## Colour classification observed on the reference

| Colour on reference | Meaning | How the application models it |
|---|---|---|
| **Green** (pre-printed) | Labels, headings, column titles, declaration wording, "Signature of Examinee", "AUTHORISED SIGNATORY" caption, footer contact lines, letterhead | Template text and field labels (versioned, editable by organisation administrators) and organisation settings |
| **Black** (typed) | Destination, exam date, "Valid upto" date, serial number, title, name, every identity value, history answers, every examination and laboratory result, units typed beside numbers, remarks | Form inputs per report (manual) — or server-generated values (serial, validity) |
| **Purple** (rubber stamps) | "ORIGINAL", centre seal, "FIT", doctor's name/registration stamp | Not reproduced. Blank space is reserved for physical stamps and signatures |

Note: "Valid upto" is printed in black on the reference (typed with its date); the application calculates it from a configurable rule (default: 1 year minus one day, matching 28/07/2026 → 27/07/2027).
Units ("Cms.", "Kgs", "grms.%", "mgs./dl") are typed in black beside values on the reference; they are configured once per field (predefined) and printed in black beside the value.

## Fixed template text (green)

- Title: **MEDICAL REPORT**; subtitle pattern: `MEDICAL FOR {destination}`
- History introduction: “History of any significant past illness including:”
- Declaration: “I hereby permit the {declaration_organisation_name} and the undersigned physician to furnish such information the company may need performing to my health status and other pertinent and medical findings and do hereby release them from any and all legal responsibility by doing so. I also certify that my medical history contained above is true and any false statement will disqualify me from my employment, benefits and claims.”
- Examinee signature label: “Signature of Examinee”
- Table headings: “MEDICAL EXAMINATION” (TYPE OF MEDICAL EXAM | RESULTS), “LABORATORY INVESTIGATIONS” (TYPE OF LAB. INVESTIGATIONS | RESULTS)
- Remarks label: “Remarks”; signatory caption: “AUTHORISED SIGNATORY” + organisation declaration name

## Fields

| Section | Group (printed) | Printed label | Key | Category | Type | Required | Options / unit / rules |
|---|---|---|---|---|---|---|---|
| report | — | Medical for (destination country) | `destination` | black / manual | select | yes | options: QATAR, SAUDI ARABIA, UNITED ARAB EMIRATES, KUWAIT, OMAN, BAHRAIN; locked |
| examinee | — | Name | `name_title` | black / manual | select | no | options: Mr., Mrs., Ms., Miss |
| examinee | — | Name | `full_name` | black / manual | text | yes | ≤55 chars; locked |
| examinee | — | Height | `height_cm` | black / manual | number | yes | unit: Cms.; min 50; max 250 |
| examinee | — | Weight | `weight_kg` | black / manual | number | yes | unit: Kgs; min 20; max 300 |
| examinee | — | Sex | `sex` | black / manual | select | yes | options: MALE, FEMALE; locked |
| examinee | — | Status | `marital_status` | black / manual | select | yes | options: SINGLE, MARRIED, DIVORCED, WIDOWED |
| examinee | — | DOB | `date_of_birth` | black / manual | date | yes | locked |
| examinee | — | Nationality | `nationality` | black / manual | text | yes | ≤14 chars |
| examinee | — | Passport No | `passport_number` | black / manual | text | yes | ≤13 chars; pattern `^[A-Za-z0-9 ]{5,13}$`; locked |
| examinee | — | Place of Issue | `place_of_issue` | black / manual | text | no | ≤14 chars |
| examinee | — | DOI | `date_of_issue` | black / manual | date | no |  |
| examinee | — | Date of expiry (if applicable) | `date_of_expiry` | black / manual | date | no | not printed |
| examinee | — | Position applied for | `position_applied_for` | black / manual | text | yes | ≤45 chars |
| history | — | 1) Psychiatric and Neurological disorders (Epilepsy, Depression) | `psychiatric_neurological` | black / manual | result | yes | options: NIL, PRESENT; ≤16 chars |
| history | — | 2) Allergy | `allergy` | black / manual | result | yes | options: NIL, PRESENT; ≤16 chars |
| history | — | 3) Others | `others` | black / manual | result | yes | options: NIL, PRESENT; ≤16 chars |
| examination | EYE | R. EYE | `right_eye` | black / manual | result | yes | options: NAD 6/6, NAD 6/9, NAD 6/12, 6/6, 6/9, 6/12, 6/18, 6/24, 6/36, 6/60; ≤14 chars |
| examination | EYE | L. EYE | `left_eye` | black / manual | result | yes | options: NAD 6/6, NAD 6/9, NAD 6/12, 6/6, 6/9, 6/12, 6/18, 6/24, 6/36, 6/60; ≤14 chars |
| examination | EAR | R. EAR | `right_ear` | black / manual | result | yes | options: NAD, ABNORMAL; ≤14 chars |
| examination | EAR | L. EAR | `left_ear` | black / manual | result | yes | options: NAD, ABNORMAL; ≤14 chars |
| examination | SYSTEMATIC EXAMINATION | CARDIO-VASCULAR | `cardiovascular` | black / manual | result | yes | options: NORMAL, ABNORMAL; ≤14 chars |
| examination | SYSTEMATIC EXAMINATION | B.P. | `blood_pressure` | black / manual | text | yes | ≤15 chars; pattern `^\d{2,3}/\d{2,3}(/\d{2,3})?$` |
| examination | SYSTEMATIC EXAMINATION | HEART | `heart` | black / manual | result | yes | options: NAD, ABNORMAL; ≤14 chars |
| examination | RESPIRATORY SYSTEM | LUNGS | `lungs` | black / manual | result | yes | options: NAD, ABNORMAL; ≤14 chars |
| examination | RESPIRATORY SYSTEM | CHEST X-RAY | `chest_xray` | black / manual | result | yes | options: NORMAL, ABNORMAL; ≤14 chars |
| examination | GASTRO INTESTINAL | ABDOMEN | `abdomen` | black / manual | result | yes | options: NAD, ABNORMAL; ≤14 chars |
| examination | OTHERS | HERNIA | `hernia` | black / manual | result | yes | options: NIL, PRESENT; ≤14 chars |
| examination | OTHERS | VARICOSE VEINS | `varicose_veins` | black / manual | result | yes | options: NIL, PRESENT; ≤14 chars |
| examination | OTHERS | EXTREMITIES | `extremities` | black / manual | result | yes | options: NAD, ABNORMAL; ≤14 chars |
| examination | OTHERS | DEFORMITIES | `deformities` | black / manual | result | yes | options: NIL, PRESENT; ≤14 chars |
| examination | OTHERS | SKIN | `skin` | black / manual | result | yes | options: NAD, ABNORMAL; ≤14 chars |
| examination | VENEREAL DISEASES | CLINICAL | `clinical` | black / manual | result | yes | options: NAD, ABNORMAL; ≤14 chars |
| laboratory | URINE | SUGAR | `urine_sugar` | black / manual | result | yes | options: ABSENT, PRESENT, TRACE; ≤12 chars |
| laboratory | URINE | ALBUMIN | `urine_albumin` | black / manual | result | yes | options: ABSENT, PRESENT, TRACE; ≤12 chars |
| laboratory | STOOL | ROUTINE | `stool_routine` | black / manual | result | yes | options: NAD, ABNORMAL; ≤12 chars |
| laboratory | STOOL | 1. HELMINTHES | `helminthes` | black / manual | result | yes | options: NIL, PRESENT; ≤12 chars |
| laboratory | STOOL | 2. GIARDIA | `giardia` | black / manual | result | yes | options: ABSENT, PRESENT; ≤12 chars |
| laboratory | STOOL | 3. SALMONELLA | `salmonella` | black / manual | result | yes | options: ABSENT, PRESENT; ≤12 chars |
| laboratory | STOOL | SHIGELLA | `shigella` | black / manual | result | yes | options: ABSENT, PRESENT; ≤12 chars |
| laboratory | STOOL | V.CHOLERA (IF ENDEMIC) | `v_cholera` | black / manual | result | no | options: ABSENT, PRESENT; ≤12 chars |
| laboratory | BLOOD | HEMOGLOBIN | `hemoglobin` | black / manual | number | yes | unit: grms.%; min 2; max 25 |
| laboratory | BLOOD | 1. MALARIA | `malaria` | black / manual | result | yes | options: NOT SEEN, SEEN; ≤12 chars |
| laboratory | BLOOD | 2. MICRO FILARIA | `micro_filaria` | black / manual | result | yes | options: NOT SEEN, SEEN; ≤12 chars |
| laboratory | BLOOD | 3. GROUPING & RH | `blood_group` | black / manual | select | yes | options: A + VE, A - VE, B + VE, B - VE, AB + VE, AB - VE, O + VE, O - VE |
| laboratory | SEROLOGY | 1. BLOOD SUGAR | `blood_sugar` | black / manual | number | yes | unit: mgs./dl; min 10; max 1000 |
| laboratory | SEROLOGY | 2. L.F.T | `lft` | black / manual | result | yes | options: NORMAL, ABNORMAL; ≤12 chars |
| laboratory | SEROLOGY | 3 CREATININE | `creatinine` | black / manual | number | yes | unit: mgs./dl; min 0.1; max 30 |
| laboratory | SEROLOGY | 4.UREA | `urea` | black / manual | number | yes | unit: mgs./dl; min 1; max 400 |
| laboratory | ELISA | 1. HIV 1-2 TEST | `hiv` | black / manual | result | yes | options: NEGATIVE, POSITIVE; ≤12 chars |
| laboratory | ELISA | 2. Hbs Ag | `hbsag` | black / manual | result | yes | options: NEGATIVE, POSITIVE; ≤12 chars |
| laboratory | ELISA | 3. Anti HCV | `anti_hcv` | black / manual | result | yes | options: NEGATIVE, POSITIVE; ≤12 chars |
| laboratory | VDRL | (group title) | `vdrl` | black / manual | result | yes | options: NEGATIVE, POSITIVE, REACTIVE, NON-REACTIVE; ≤12 chars |
| laboratory | TPHA (IF VDRL POSITIVE) | (group title) | `tpha` | black / manual | result | no | options: NEGATIVE, POSITIVE; ≤12 chars; required when laboratory.vdrl = POSITIVE/REACTIVE |
| laboratory | PREGNANCY TEST | (group title) | `pregnancy_test` | black / manual | result | no | options: NEGATIVE, POSITIVE; ≤12 chars; shown when examinee.sex = FEMALE; required when examinee.sex = FEMALE |
| laboratory | LMP | (group title) | `lmp` | black / manual | date | no | shown when examinee.sex = FEMALE |
| remarks | — | Medical officer's remarks | `remarks` | black / manual | textarea | no | ≤300 chars |

System-generated (not in the template): serial number (database sequence, format `R-7` by default), exam date (defaults to today in the organisation time zone, editable), valid-upto date (calculated), QR verification code (generated at issue).

Result fields offer the reference vocabulary as suggestions (NAD, NIL, ABSENT, NORMAL, NOT SEEN, NEGATIVE…) but never pre-fill a value.
