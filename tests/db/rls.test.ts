import { createHash, randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 50 });

type Q = pg.PoolClient;

async function as<T>(uid: string | null, fn: (c: Q) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    if (uid) {
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
    } else {
      await c.query("set local role anon");
    }
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

const superuser = async <T>(fn: (c: Q) => Promise<T>) => {
  const c = await pool.connect();
  try {
    return await fn(c);
  } finally {
    c.release();
  }
};

const ids: Record<string, string> = {};
const hash = () => createHash("sha256").update(randomBytes(32)).digest("hex");

async function createUser(key: string, org: string | null, role: string) {
  await superuser(async (c) => {
    const { rows } = await c.query("insert into auth.users (email) values ($1) returning id", [`${key}@example.test`]);
    ids[key] = rows[0].id;
    await c.query("update public.profiles set role = $2, organisation_id = $3, is_active = true where id = $1", [rows[0].id, role, org]);
  });
}

async function newDraft(uid: string, org: string, examinee: Record<string, unknown> = {}) {
  return as(uid, async (c) => {
    const { rows } = await c.query(
      "insert into public.reports (organisation_id, template_version, examinee_details) values ($1, 1, $2) returning *",
      [org, JSON.stringify({ full_name: "TEST PERSON", passport_number: "Z 1234567", ...examinee })],
    );
    return rows[0];
  });
}

async function issue(uid: string, reportId: string, tokenHash = hash(), extra = "") {
  return as(uid, (c) =>
    c.query(
      `update public.reports set status = 'completed', verification_token_hash = $2, verification_nonce = 'n', issued_snapshot = '{}'::jsonb ${extra} where id = $1 returning *`,
      [reportId, tokenHash],
    ),
  );
}

beforeAll(async () => {
  await superuser(async (c) => {
    const a = await c.query("insert into public.organisations (name) values ('Org A') returning id");
    const b = await c.query("insert into public.organisations (name, settings) values ('Org B', '{\"serial_prefix\":\"B\",\"serial_reset\":\"yearly\",\"serial_padding\":5}') returning id");
    ids.orgA = a.rows[0].id;
    ids.orgB = b.rows[0].id;
  });
  await createUser("adminA", ids.orgA, "org_admin");
  await createUser("moA", ids.orgA, "medical_officer");
  await createUser("staffA", ids.orgA, "reporting_staff");
  await createUser("auditorA", ids.orgA, "auditor");
  await createUser("staffB", ids.orgB, "reporting_staff");
  await createUser("adminB", ids.orgB, "org_admin");
  await createUser("superAdmin", null, "super_admin");
});

afterAll(async () => {
  await pool.end();
});

describe("profiles", () => {
  it("creates an inactive, organisation-less profile for new auth users", async () => {
    const row = await superuser(async (c) => {
      const { rows } = await c.query("insert into auth.users (email, raw_user_meta_data) values ('new@example.test', '{\"full_name\":\"New\",\"role\":\"super_admin\"}') returning id");
      return (await c.query("select * from public.profiles where id = $1", [rows[0].id])).rows[0];
    });
    expect(row.is_active).toBe(false);
    expect(row.organisation_id).toBeNull();
    expect(row.role).toBe("reporting_staff"); // user metadata is never trusted for roles
  });

  it("prevents users from escalating their own role", async () => {
    await expect(as(ids.staffA, (c) => c.query("update public.profiles set role = 'org_admin' where id = $1", [ids.staffA]))).rejects.toThrow(/not permitted/);
  });

  it("lets org admins change roles in their own organisation but never grant super admin", async () => {
    await as(ids.adminA, (c) => c.query("update public.profiles set role = 'medical_officer' where id = $1", [ids.staffA]));
    await as(ids.adminA, (c) => c.query("update public.profiles set role = 'reporting_staff' where id = $1", [ids.staffA]));
    await expect(as(ids.adminA, (c) => c.query("update public.profiles set role = 'super_admin' where id = $1", [ids.staffA]))).rejects.toThrow(/super administrator/);
  });

  it("does not let an org admin touch another organisation's users", async () => {
    const r = await as(ids.adminA, (c) => c.query("update public.profiles set full_name = 'x' where id = $1", [ids.staffB]));
    expect(r.rowCount).toBe(0);
  });
});

describe("reports tenant isolation", () => {
  it("assigns server-side serial numbers matching the reference format", async () => {
    const r = await newDraft(ids.staffA, ids.orgA);
    expect(r.serial_number).toMatch(/^R-\d+$/);
    expect(r.created_by).toBe(ids.staffA);
    expect(r.passport_number_normalized).toBe("Z1234567");
    expect(r.examinee_full_name).toBe("TEST PERSON");
  });

  it("supports a configurable yearly, padded serial format", async () => {
    const r = await newDraft(ids.staffB, ids.orgB);
    expect(r.serial_number).toMatch(/^B-\d{4}-\d{5}$/);
  });

  it("ignores client-supplied serial numbers", async () => {
    const r = await as(ids.staffA, async (c) =>
      (await c.query("insert into public.reports (organisation_id, template_version, serial_number) values ($1, 1, 'HACK-1') returning serial_number", [ids.orgA])).rows[0],
    );
    expect(r.serial_number).not.toBe("HACK-1");
  });

  it("hides reports from other organisations (select, update, insert)", async () => {
    const r = await newDraft(ids.staffA, ids.orgA);
    const seen = await as(ids.staffB, (c) => c.query("select id from public.reports where id = $1", [r.id]));
    expect(seen.rowCount).toBe(0);
    const upd = await as(ids.staffB, (c) => c.query("update public.reports set remarks = 'x' where id = $1", [r.id]));
    expect(upd.rowCount).toBe(0);
    await expect(newDraft(ids.staffB, ids.orgA)).rejects.toThrow(/row-level security/);
    const registry = await as(ids.staffB, (c) => c.query("select id from public.report_registry where id = $1", [r.id]));
    expect(registry.rowCount).toBe(0);
  });

  it("denies anonymous table access entirely", async () => {
    await expect(as(null, (c) => c.query("select * from public.reports"))).rejects.toThrow(/permission denied/);
    await expect(as(null, (c) => c.query("select * from public.report_registry"))).rejects.toThrow(/permission denied/);
  });

  it("gives auditors metadata only (no medical rows, masked passport)", async () => {
    const r = await newDraft(ids.staffA, ids.orgA);
    const full = await as(ids.auditorA, (c) => c.query("select * from public.reports where id = $1", [r.id]));
    expect(full.rowCount).toBe(0);
    const meta = await as(ids.auditorA, (c) => c.query("select * from public.report_registry where id = $1", [r.id]));
    expect(meta.rowCount).toBe(1);
    expect(meta.rows[0].passport_search).toBeNull();
    expect(meta.rows[0].passport_masked).toBe("•••••567");
    expect(meta.rows[0]).not.toHaveProperty("medical_examination");
    await expect(newDraft(ids.auditorA, ids.orgA)).rejects.toThrow(/row-level security/);
  });

  it("gives super administrators no access to medical content", async () => {
    const r = await newDraft(ids.staffA, ids.orgA);
    const res = await as(ids.superAdmin, (c) => c.query("select id from public.reports where id = $1", [r.id]));
    expect(res.rowCount).toBe(0);
  });
});

describe("serial numbers under concurrency", () => {
  it("never duplicates serials when many drafts are created at once", async () => {
    const results = await Promise.all(Array.from({ length: 40 }, () => newDraft(ids.staffA, ids.orgA)));
    const serials = results.map((r) => r.serial_number);
    expect(new Set(serials).size).toBe(40);
  });
});

describe("workflow and immutability", () => {
  it("only approvers can issue; issued reports are immutable", async () => {
    const r = await newDraft(ids.staffA, ids.orgA);
    await as(ids.staffA, (c) => c.query("update public.reports set status = 'pending_review' where id = $1", [r.id]));
    await expect(issue(ids.staffA, r.id)).rejects.toThrow(/medical officer/);
    const issued = await issue(ids.moA, r.id);
    expect(issued.rows[0].status).toBe("completed");
    expect(issued.rows[0].verification_status).toBe("valid");
    expect(issued.rows[0].approved_by).toBe(ids.moA);
    await expect(
      as(ids.moA, (c) => c.query(`update public.reports set examinee_details = '{"full_name":"CHANGED"}' where id = $1`, [r.id])),
    ).rejects.toThrow(/cannot be modified/);
    await expect(as(ids.moA, (c) => c.query("update public.reports set status = 'draft' where id = $1", [r.id]))).rejects.toThrow(/invalid status transition/);
  });

  it("requires a token and snapshot to complete", async () => {
    const r = await newDraft(ids.moA, ids.orgA);
    await expect(as(ids.moA, (c) => c.query("update public.reports set status = 'completed' where id = $1", [r.id]))).rejects.toThrow(/verification token/);
  });

  it("does not allow reports to be created already completed", async () => {
    await expect(
      as(ids.moA, (c) => c.query("insert into public.reports (organisation_id, template_version, status) values ($1, 1, 'completed')", [ids.orgA])),
    ).rejects.toThrow(/created as drafts/);
  });

  it("revokes only by approvers", async () => {
    const r = await newDraft(ids.staffA, ids.orgA);
    await issue(ids.moA, r.id);
    await expect(as(ids.staffA, (c) => c.query("update public.reports set status = 'revoked' where id = $1", [r.id]))).rejects.toThrow(/not permitted/);
    const res = await as(ids.adminA, (c) => c.query("update public.reports set status = 'revoked', revoked_reason = 'test' where id = $1 returning verification_status, revoked_at", [r.id]));
    expect(res.rows[0].verification_status).toBe("revoked");
    expect(res.rows[0].revoked_at).not.toBeNull();
  });

  it("handles revisions: same serial, next revision, original superseded", async () => {
    const original = await newDraft(ids.staffA, ids.orgA);
    const tokenHash = hash();
    await issue(ids.moA, original.id, tokenHash);
    await expect(
      as(ids.staffA, (c) => c.query("insert into public.reports (organisation_id, template_version, revision_of) values ($1, 1, $2)", [ids.orgA, original.id])),
    ).rejects.toThrow(/not permitted to revise/);
    const rev = await as(ids.moA, async (c) =>
      (await c.query("insert into public.reports (organisation_id, template_version, revision_of) values ($1, 1, $2) returning *", [ids.orgA, original.id])).rows[0],
    );
    expect(rev.serial_number).toBe(original.serial_number);
    expect(rev.revision_number).toBe(2);
    await expect(
      as(ids.moA, (c) => c.query("insert into public.reports (organisation_id, template_version, revision_of) values ($1, 1, $2)", [ids.orgA, original.id])),
    ).rejects.toThrow(/already in progress/);
    await expect(
      as(ids.moA, (c) => c.query("update public.reports set status = 'superseded', superseded_by = $2 where id = $1", [original.id, rev.id])),
    ).rejects.toThrow(/superseding revision must be issued/);
    await issue(ids.moA, rev.id);
    await as(ids.moA, (c) => c.query("update public.reports set status = 'superseded', superseded_by = $2 where id = $1", [original.id, rev.id]));
    const v = await as(null, async (c) => (await c.query("select public.verify_report($1) as v", [tokenHash])).rows[0].v);
    expect(v.result).toBe("superseded");
  });

  it("restricts archiving to organisation administrators", async () => {
    const r = await newDraft(ids.staffA, ids.orgA);
    await expect(as(ids.staffA, (c) => c.query("update public.reports set archived_at = now() where id = $1", [r.id]))).rejects.toThrow(/archive/);
    await as(ids.adminA, (c) => c.query("update public.reports set archived_at = now() where id = $1", [r.id]));
  });
});

describe("public verification", () => {
  it("returns only minimal, non-sensitive information", async () => {
    const r = await newDraft(ids.staffA, ids.orgA, { date_of_birth: "1995-01-01" });
    const tokenHash = hash();
    await issue(ids.moA, r.id, tokenHash, ", valid_until = current_date + 30");
    const v = await as(null, async (c) => (await c.query("select public.verify_report($1) as v", [tokenHash])).rows[0].v);
    expect(v.result).toBe("valid");
    expect(v.reference).toBe(r.serial_number);
    expect(v.organisation).toBe("Org A");
    const json = JSON.stringify(v);
    expect(json).not.toMatch(/TEST PERSON|1234567|1995-01-01/);
    expect(Object.keys(v).sort()).toEqual(["issued_on", "organisation", "reference", "result", "revision", "revoked_on", "valid_until"]);
  });

  it("fails safely for unknown or malformed tokens and drafts", async () => {
    const draft = await newDraft(ids.staffA, ids.orgA);
    void draft;
    for (const t of [hash(), "not-a-hash", "", "' or 1=1 --"]) {
      const v = await as(null, async (c) => (await c.query("select public.verify_report($1) as v", [t])).rows[0].v);
      expect(v).toEqual({ result: "not_found" });
    }
  });

  it("reports expired and revoked states", async () => {
    const r = await newDraft(ids.staffA, ids.orgA);
    const tokenHash = hash();
    await superuser((c) => c.query("update public.reports set report_date = current_date - 400 where id = $1", [r.id]));
    await issue(ids.moA, r.id, tokenHash, ", valid_until = current_date - 1");
    let v = await as(null, async (c) => (await c.query("select public.verify_report($1) as v", [tokenHash])).rows[0].v);
    expect(v.result).toBe("expired");
    await as(ids.moA, (c) => c.query("update public.reports set status = 'revoked' where id = $1", [r.id]));
    v = await as(null, async (c) => (await c.query("select public.verify_report($1) as v", [tokenHash])).rows[0].v);
    expect(v.result).toBe("revoked");
  });
});

describe("audit trail", () => {
  it("records creation and status changes and is append-only", async () => {
    const r = await newDraft(ids.staffA, ids.orgA);
    await as(ids.staffA, (c) => c.query("update public.reports set status = 'pending_review' where id = $1", [r.id]));
    await as(ids.staffA, (c) => c.query("select public.log_audit_event('report.viewed', 'report', $1, $1, '{}'::jsonb)", [r.id]));
    const logs = await as(ids.auditorA, (c) => c.query("select action, actor_id from public.audit_logs where report_id = $1 order by created_at", [r.id]));
    expect(logs.rows.map((l) => l.action)).toEqual(expect.arrayContaining(["report.created", "report.status_changed", "report.viewed"]));
    expect(logs.rows.every((l) => l.actor_id === ids.staffA)).toBe(true);
    const staffView = await as(ids.staffA, (c) => c.query("select 1 from public.audit_logs where report_id = $1", [r.id]));
    expect(staffView.rowCount).toBe(0);
    await expect(superuser((c) => c.query("delete from public.audit_logs where report_id = $1", [r.id]))).rejects.toThrow(/append-only/);
    await expect(as(ids.staffA, (c) => c.query("insert into public.audit_logs (action, entity_type) values ('x.y', 'z')"))).rejects.toThrow();
  });

  it("refuses audit events about other organisations' reports", async () => {
    const r = await newDraft(ids.staffB, ids.orgB);
    await expect(as(ids.staffA, (c) => c.query("select public.log_audit_event('report.viewed', 'report', $1, $1, '{}'::jsonb)", [r.id]))).rejects.toThrow(/not found/);
  });
});

describe("passport documents and files", () => {
  it("requires organisation/report scoped storage paths and same-org reports", async () => {
    const r = await newDraft(ids.staffA, ids.orgA);
    await as(ids.staffA, (c) =>
      c.query("insert into public.passport_documents (report_id, organisation_id, storage_path, mime_type, file_size) values ($1, $2, $3, 'application/pdf', 10)", [
        r.id,
        ids.orgA,
        `${ids.orgA}/${r.id}/passport/a.pdf`,
      ]),
    );
    await expect(
      as(ids.staffA, (c) =>
        c.query("insert into public.passport_documents (report_id, organisation_id, storage_path, mime_type, file_size) values ($1, $2, $3, 'application/pdf', 10)", [
          r.id,
          ids.orgA,
          `elsewhere/b.pdf`,
        ]),
      ),
    ).rejects.toThrow(/scoped/);
    const docs = await as(ids.auditorA, (c) => c.query("select 1 from public.passport_documents where report_id = $1", [r.id]));
    expect(docs.rowCount).toBe(0);
    const other = await as(ids.staffB, (c) => c.query("select 1 from public.passport_documents where report_id = $1", [r.id]));
    expect(other.rowCount).toBe(0);
  });

  it("only attaches report files to issued reports, by approvers", async () => {
    const r = await newDraft(ids.staffA, ids.orgA);
    const insertFile = (uid: string) =>
      as(uid, (c) =>
        c.query(
          "insert into public.report_files (report_id, organisation_id, version, storage_path, content_hash, file_size, page_count, template_version) values ($1, $2, 1, $3, $4, 100, 1, 1)",
          [r.id, ids.orgA, `${ids.orgA}/${r.id}/reports/report-v1.pdf`, hash()],
        ),
      );
    await expect(insertFile(ids.moA)).rejects.toThrow(/issued reports/);
    await issue(ids.moA, r.id);
    await expect(insertFile(ids.staffA)).rejects.toThrow(/row-level security/);
    await insertFile(ids.moA);
  });
});

describe("storage policies", () => {
  const put = (uid: string, bucket: string, name: string) =>
    as(uid, (c) => c.query("insert into storage.objects (bucket_id, name) values ($1, $2)", [bucket, name]));

  it("buckets are private", async () => {
    const { rows } = await superuser((c) => c.query("select id, public from storage.buckets order by id"));
    expect(rows).toEqual([
      { id: "generated-reports", public: false },
      { id: "organisation-assets", public: false },
      { id: "passport-documents", public: false },
    ]);
  });

  it("scopes passport uploads and reads to the caller's organisation", async () => {
    const path = `${ids.orgA}/r1/passport/doc.pdf`;
    await put(ids.staffA, "passport-documents", path);
    await expect(put(ids.staffA, "passport-documents", `${ids.orgB}/r1/passport/doc.pdf`)).rejects.toThrow(/row-level security/);
    const crossRead = await as(ids.staffB, (c) => c.query("select 1 from storage.objects where name = $1", [path]));
    expect(crossRead.rowCount).toBe(0);
    const auditorRead = await as(ids.auditorA, (c) => c.query("select 1 from storage.objects where name = $1", [path]));
    expect(auditorRead.rowCount).toBe(0);
    const anonRead = await as(null, (c) => c.query("select 1 from storage.objects where name = $1", [path])).catch(() => ({ rowCount: 0 }));
    expect(anonRead.rowCount).toBe(0);
  });

  it("allows only approvers to write generated reports and only admins to write assets", async () => {
    await expect(put(ids.staffA, "generated-reports", `${ids.orgA}/r1/reports/report-v1.pdf`)).rejects.toThrow(/row-level security/);
    await put(ids.moA, "generated-reports", `${ids.orgA}/r1/reports/report-v1.pdf`);
    await expect(put(ids.moA, "organisation-assets", `${ids.orgA}/letterhead/logo.png`)).rejects.toThrow(/row-level security/);
    await put(ids.adminA, "organisation-assets", `${ids.orgA}/letterhead/logo.png`);
  });
});

describe("templates", () => {
  it("freezes template versions that are referenced by reports", async () => {
    const t = await as(ids.adminA, async (c) =>
      (await c.query("insert into public.report_templates (organisation_id, name, version, field_configuration) values ($1, 'T', 99, '{}') returning id", [ids.orgA])).rows[0],
    );
    await as(ids.adminA, (c) => c.query(`update public.report_templates set field_configuration = '{"a":1}' where id = $1`, [t.id]));
    await as(ids.staffA, (c) => c.query("insert into public.reports (organisation_id, template_version, template_id) values ($1, 99, $2)", [ids.orgA, t.id]));
    await expect(as(ids.adminA, (c) => c.query(`update public.report_templates set field_configuration = '{"a":2}' where id = $1`, [t.id]))).rejects.toThrow(/in use/);
    await expect(
      as(ids.staffA, (c) => c.query("insert into public.report_templates (organisation_id, name, version, field_configuration) values ($1, 'T', 100, '{}')", [ids.orgA])),
    ).rejects.toThrow(/row-level security/);
  });
});
