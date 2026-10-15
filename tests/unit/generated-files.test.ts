import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildBootstrapSql, buildSetupSql } from "../../scripts/sql-bundle";

describe("generated setup files", () => {
  it("supabase/setup.sql matches the migrations (run `npm run sql:bundle`)", () => {
    expect(readFileSync("supabase/setup.sql", "utf8")).toBe(buildSetupSql());
  });
  it("supabase/bootstrap-organisation.sql matches the default template (run `npm run sql:bundle`)", () => {
    expect(readFileSync("supabase/bootstrap-organisation.sql", "utf8")).toBe(buildBootstrapSql());
  });
});
