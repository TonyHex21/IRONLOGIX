require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { z } = require("zod");
const { PrismaClient } = require("@prisma/client");

const { parse } = require("csv-parse/sync");
const { stringify } = require("csv-stringify/sync");

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json({ limit: "25mb" }));

// --------------------
// API Key auth (skip for /health)
// --------------------
app.use((req, res, next) => {
  if (req.path === "/health") return next();
  const apiKey = req.headers["x-api-key"];
  if (!process.env.API_KEY) return next();
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ ok: false, error: "Invalid API key" });
  }
  next();
});

// --------------------
// Health
// --------------------
app.get("/health", (req, res) => {
  res.json({ ok: true, name: "IRONLOGIX API", time: new Date().toISOString() });
});

// --------------------
// Seed (safe to run many times)
// --------------------
app.post("/seed", async (req, res) => {
  try {
    const COMPANY_NAME = "IRONLOGIX Demo Company";

    let company = await prisma.company.findFirst({ where: { name: COMPANY_NAME } });
    if (!company) company = await prisma.company.create({ data: { name: COMPANY_NAME } });

    async function findOrCreateUser({ name, email, role }) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return existing;
      return prisma.user.create({
        data: { companyId: company.id, name, email, role, isActive: true },
      });
    }

    const director = await findOrCreateUser({
      name: "Safety Director",
      email: "director@ironlogix.local",
      role: "SAFETY_DIRECTOR",
    });

    const supervisor = await findOrCreateUser({
      name: "Supervisor",
      email: "supervisor@ironlogix.local",
      role: "SUPERVISOR",
    });

    const tech = await findOrCreateUser({
      name: "Safety Tech",
      email: "tech@ironlogix.local",
      role: "SAFETY_TECH",
    });

    res.json({ ok: true, company, users: { director, supervisor, tech } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// --------------------
// Core validators
// --------------------
const UUID = z.string().uuid();

const CreateIncidentSchema = z.object({
  companyId: UUID,
  reportedById: UUID,
  incidentType: z.string().min(1),
  description: z.string().min(1),
  occurredAt: z.string().datetime(),
});

const CreateViolationSchema = z.object({
  companyId: UUID,
  issuedById: UUID,
  category: z.string().min(1),
  description: z.string().min(1),
  correctiveAction: z.string().optional(),
  retrainingRequired: z.boolean().optional(),
});

const CreateInspectionSchema = z.object({
  companyId: UUID,
  performedById: UUID,
  inspectionType: z.string().min(1),
  checklistName: z.string().min(1),
  result: z.enum(["PASS", "FAIL", "OUT_OF_SERVICE"]),
  notes: z.string().optional(),
  performedAt: z.string().datetime(),
});

// --------------------
// Incidents
// --------------------
app.post("/incidents", async (req, res) => {
  try {
    const p = CreateIncidentSchema.parse(req.body);
    const incident = await prisma.incident.create({
      data: {
        companyId: p.companyId,
        reportedById: p.reportedById,
        incidentType: p.incidentType,
        description: p.description,
        occurredAt: new Date(p.occurredAt),
        status: "DRAFT",
      },
    });
    res.status(201).json({ ok: true, incident });
  } catch (err) {
    if (err?.name === "ZodError") return res.status(400).json({ ok: false, error: err.errors });
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/incidents", async (req, res) => {
  try {
    const companyId = String(req.query.companyId || "");
    if (!companyId) return res.status(400).json({ ok: false, error: "companyId is required" });

    const incidents = await prisma.incident.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    res.json({ ok: true, incidents });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// --------------------
// Violations
// --------------------
app.post("/violations", async (req, res) => {
  try {
    const p = CreateViolationSchema.parse(req.body);
    const violation = await prisma.violation.create({
      data: {
        companyId: p.companyId,
        issuedById: p.issuedById,
        category: p.category,
        description: p.description,
        correctiveAction: p.correctiveAction || null,
        retrainingRequired: p.retrainingRequired ?? false,
        status: "ISSUED",
      },
    });
    res.status(201).json({ ok: true, violation });
  } catch (err) {
    if (err?.name === "ZodError") return res.status(400).json({ ok: false, error: err.errors });
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/violations", async (req, res) => {
  try {
    const companyId = String(req.query.companyId || "");
    if (!companyId) return res.status(400).json({ ok: false, error: "companyId is required" });

    const violations = await prisma.violation.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    res.json({ ok: true, violations });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// --------------------
// Inspections
// --------------------
app.post("/inspections", async (req, res) => {
  try {
    const p = CreateInspectionSchema.parse(req.body);
    const inspection = await prisma.inspection.create({
      data: {
        companyId: p.companyId,
        performedById: p.performedById,
        inspectionType: p.inspectionType,
        checklistName: p.checklistName,
        result: p.result,
        notes: p.notes || null,
        performedAt: new Date(p.performedAt),
      },
    });
    res.status(201).json({ ok: true, inspection });
  } catch (err) {
    if (err?.name === "ZodError") return res.status(400).json({ ok: false, error: err.errors });
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/inspections", async (req, res) => {
  try {
    const companyId = String(req.query.companyId || "");
    if (!companyId) return res.status(400).json({ ok: false, error: "companyId is required" });

    const inspections = await prisma.inspection.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    res.json({ ok: true, inspections });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===================================================================
// CSV EXPORT / IMPORT (MONEY FEATURE)
// ===================================================================

// ---- CSV templates (downloadable) ----
app.get("/csv/templates/:entity", (req, res) => {
  const entity = String(req.params.entity || "").toLowerCase();

  let header;
  if (entity === "incidents") {
    header = ["companyId", "reportedById", "incidentType", "description", "occurredAt"];
  } else if (entity === "violations") {
    header = ["companyId", "issuedById", "category", "description", "correctiveAction", "retrainingRequired"];
  } else if (entity === "inspections") {
    header = ["companyId", "performedById", "inspectionType", "checklistName", "result", "notes", "performedAt"];
  } else {
    return res.status(400).json({ ok: false, error: "entity must be incidents | violations | inspections" });
  }

  const csv = stringify([header], { header: false });
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${entity}_template.csv"`);
  res.send(csv);
});

// ---- CSV export live data ----
app.get("/csv/export/:entity", async (req, res) => {
  try {
    const entity = String(req.params.entity || "").toLowerCase();
    const companyId = String(req.query.companyId || "");
    if (!companyId) return res.status(400).json({ ok: false, error: "companyId is required" });

    if (entity === "incidents") {
      const rows = await prisma.incident.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } });
      const data = rows.map(r => ({
        id: r.id,
        companyId: r.companyId,
        reportedById: r.reportedById,
        incidentType: r.incidentType,
        description: r.description,
        occurredAt: r.occurredAt.toISOString(),
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      }));
      const csv = stringify(data, { header: true });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="incidents_${companyId}.csv"`);
      return res.send(csv);
    }

    if (entity === "violations") {
      const rows = await prisma.violation.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } });
      const data = rows.map(r => ({
        id: r.id,
        companyId: r.companyId,
        issuedById: r.issuedById,
        category: r.category,
        description: r.description,
        correctiveAction: r.correctiveAction || "",
        retrainingRequired: r.retrainingRequired,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      }));
      const csv = stringify(data, { header: true });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="violations_${companyId}.csv"`);
      return res.send(csv);
    }

    if (entity === "inspections") {
      const rows = await prisma.inspection.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } });
      const data = rows.map(r => ({
        id: r.id,
        companyId: r.companyId,
        performedById: r.performedById,
        inspectionType: r.inspectionType,
        checklistName: r.checklistName,
        result: r.result,
        notes: r.notes || "",
        performedAt: r.performedAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      }));
      const csv = stringify(data, { header: true });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="inspections_${companyId}.csv"`);
      return res.send(csv);
    }

    return res.status(400).json({ ok: false, error: "entity must be incidents | violations | inspections" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- CSV import (paste CSV text or upload later) ----
// Body: { companyId, createdById, csvText }
const ImportBodySchema = z.object({
  companyId: UUID,
  createdById: UUID,
  csvText: z.string().min(1),
});

app.post("/csv/import/:entity", async (req, res) => {
  const entity = String(req.params.entity || "").toLowerCase();

  try {
    const { companyId, createdById, csvText } = ImportBodySchema.parse(req.body);

    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    let successCount = 0;
    const errors = [];

    // Limit to protect server during MVP
    if (records.length > 2000) {
      return res.status(400).json({ ok: false, error: "Too many rows. Limit 2000 per import." });
    }

    if (entity === "incidents") {
      for (let i = 0; i < records.length; i++) {
        try {
          const row = records[i];
          const payload = CreateIncidentSchema.parse({
            companyId: row.companyId || companyId,
            reportedById: row.reportedById,
            incidentType: row.incidentType,
            description: row.description,
            occurredAt: row.occurredAt,
          });

          await prisma.incident.create({
            data: {
              companyId: payload.companyId,
              reportedById: payload.reportedById,
              incidentType: payload.incidentType,
              description: payload.description,
              occurredAt: new Date(payload.occurredAt),
              status: "DRAFT",
            },
          });

          successCount++;
        } catch (e) {
          errors.push({ row: i + 2, error: e.message }); // +2 for header + 1-index
        }
      }

      const job = await prisma.importJob.create({
        data: {
          companyId,
          createdById,
          entity: "INCIDENT",
          rowCount: records.length,
          successCount,
          errorCount: errors.length,
          errorsJson: errors.length ? JSON.stringify(errors) : null,
        },
      });

      return res.json({ ok: true, imported: successCount, failed: errors.length, importJob: job, errors });
    }

    if (entity === "violations") {
      for (let i = 0; i < records.length; i++) {
        try {
          const row = records[i];
          const retraining =
            String(row.retrainingRequired || "").toLowerCase() === "true" ||
            String(row.retrainingRequired || "") === "1" ||
            String(row.retrainingRequired || "").toLowerCase() === "yes";

          const payload = CreateViolationSchema.parse({
            companyId: row.companyId || companyId,
            issuedById: row.issuedById,
            category: row.category,
            description: row.description,
            correctiveAction: row.correctiveAction || undefined,
            retrainingRequired: retraining,
          });

          await prisma.violation.create({
            data: {
              companyId: payload.companyId,
              issuedById: payload.issuedById,
              category: payload.category,
              description: payload.description,
              correctiveAction: payload.correctiveAction || null,
              retrainingRequired: payload.retrainingRequired ?? false,
              status: "ISSUED",
            },
          });

          successCount++;
        } catch (e) {
          errors.push({ row: i + 2, error: e.message });
        }
      }

      const job = await prisma.importJob.create({
        data: {
          companyId,
          createdById,
          entity: "VIOLATION",
          rowCount: records.length,
          successCount,
          errorCount: errors.length,
          errorsJson: errors.length ? JSON.stringify(errors) : null,
        },
      });

      return res.json({ ok: true, imported: successCount, failed: errors.length, importJob: job, errors });
    }

    if (entity === "inspections") {
      for (let i = 0; i < records.length; i++) {
        try {
          const row = records[i];
          const payload = CreateInspectionSchema.parse({
            companyId: row.companyId || companyId,
            performedById: row.performedById,
            inspectionType: row.inspectionType,
            checklistName: row.checklistName,
            result: row.result,
            notes: row.notes || undefined,
            performedAt: row.performedAt,
          });

          await prisma.inspection.create({
            data: {
              companyId: payload.companyId,
              performedById: payload.performedById,
              inspectionType: payload.inspectionType,
              checklistName: payload.checklistName,
              result: payload.result,
              notes: payload.notes || null,
              performedAt: new Date(payload.performedAt),
            },
          });

          successCount++;
        } catch (e) {
          errors.push({ row: i + 2, error: e.message });
        }
      }

      const job = await prisma.importJob.create({
        data: {
          companyId,
          createdById,
          entity: "INSPECTION",
          rowCount: records.length,
          successCount,
          errorCount: errors.length,
          errorsJson: errors.length ? JSON.stringify(errors) : null,
        },
      });

      return res.json({ ok: true, imported: successCount, failed: errors.length, importJob: job, errors });
    }

    return res.status(400).json({ ok: false, error: "entity must be incidents | violations | inspections" });
  } catch (err) {
    if (err?.name === "ZodError") return res.status(400).json({ ok: false, error: err.errors });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- View import history ----
app.get("/imports", async (req, res) => {
  try {
    const companyId = String(req.query.companyId || "");
    if (!companyId) return res.status(400).json({ ok: false, error: "companyId is required" });

    const jobs = await prisma.importJob.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    res.json({ ok: true, jobs });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// --------------------
// Graceful shutdown
// --------------------
process.on("SIGINT", async () => {
  try {
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`IRONLOGIX API running on http://localhost:${PORT}`);
  console.log(`API Key header: x-api-key: ${process.env.API_KEY || "(not set)"}`);
});
