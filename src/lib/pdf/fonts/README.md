# Report fonts

`ReportSans-*` and `ReportSerif-*` are **modified versions** of Liberation Sans and Liberation Serif 2.x
(Copyright (c) 2012 Red Hat, Inc.; digitized data (c) 2010 Google Corporation), metric-compatible with
Arial and Times New Roman, which the reference report uses.

Modifications: subset to Latin (U+0020–017F plus common punctuation), converted to WOFF2 and renamed,
as required by the SIL Open Font License for modified versions (the Reserved Font Name is not used).
Licensed under the SIL Open Font License 1.1 — see `OFL.txt`.

The fonts are embedded into the print template (`fonts.generated.ts`) so PDFs look identical on any
server, including serverless hosts without system fonts. Regenerate with `npm run fonts:generate`.
