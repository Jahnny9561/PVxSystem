// src/index.ts
import express from "express";
import dotenv from "dotenv";
import { prisma } from "./prisma/client";
import { Prisma } from "@prisma/client";

dotenv.config();
const app = express();
app.use(express.json());

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// in-memory timers (siteId -> node timer)
const simulators = new Map<number, ReturnType<typeof setInterval>>();

// --- helpers (simple physical-ish model) ---
function irradianceAtHour(hour: number, sunrise = 6, sunset = 18, gMax = 900) {
  if (hour < sunrise || hour > sunset) return 0;
  const dayLen = sunset - sunrise;
  const x = (hour - sunrise) / dayLen; // 0..1
  return Math.max(0, gMax * Math.sin(Math.PI * x));
}

function moduleTemp(ambient: number, irradiance: number, NOCT = 45) {
  return ambient + (NOCT - 20) * (irradiance / 800);
}

// compute AC power (kW) using site capacity_kw as max AC output
function computeACPowerKw(capacityKw: number, irradiance: number, tempCoeff = -0.004, moduleTempC = 25, derate = 0.95) {
  // treat irradiance 1000 W/m2 => full capacity; scale linearly
  const gFactor = irradiance / 1000;
  const tempFactor = 1 + tempCoeff * (moduleTempC - 25);
  const p_dc_kw = capacityKw * gFactor * derate * tempFactor;
  const inverterEff = 0.98;
  const p_ac_kw = Math.max(0, p_dc_kw * inverterEff);
  // clip to capacity
  return Math.min(p_ac_kw, capacityKw);
}

// utility: convert number -> Prisma.Decimal safely
function toDecimal(v: number | string) {
  return new Prisma.Decimal(v);
}

// create a “virtual” device used for telemetry rows if none present
async function ensureSiteDevice(siteId: number) {
  // see your Device table: device.type = "SIMULATED_INVERTER"
  const existing = await prisma.device.findFirst({ where: { name: `sim-site-${siteId}` } });
  if (existing) return existing;
  return prisma.device.create({
    data: {
      type: "SIMULATED_INVERTER",
      name: `sim-site-${siteId}`,
      manufacturer: "sim",
      model: "virtual",
    },
  });
}

// generate a single telemetry point for a site
async function generateTelemetryPointForSite(siteId: number) {
  const site = await prisma.site.findUnique({ where: { site_id: siteId } });
  if (!site) throw new Error("Site not found");
  // capacity_kw is Decimal | null
  const capKw = site.capacity_kw ? Number(site.capacity_kw.toString()) : 1.0;

  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const irradiance = irradianceAtHour(hour);
  const ambient = 20 + 10 * Math.sin((2 * Math.PI / 24) * hour - Math.PI / 2); // 10..30C
  const mtemp = moduleTemp(ambient, irradiance);

  const powerKw = computeACPowerKw(capKw, irradiance, -0.004, mtemp, 0.95);
  const device = await ensureSiteDevice(siteId);

  // write weather_data
  await prisma.weatherData.create({
    data: {
      site_id: siteId,
      timestamp: now,
      irradiance_wm2: toDecimal(+(irradiance.toFixed(2))),
      ambient_temp_c: toDecimal(+(ambient.toFixed(2))),
      module_temp_c: toDecimal(+(mtemp.toFixed(2))),
      wind_speed_ms: toDecimal(0),
      wind_dir_deg: toDecimal(0),
    },
  });

  // write telemetry (Power parameter for simulated device)
  await prisma.telemetry.create({
    data: {
      device_type: "SIMULATED_INVERTER",
      device_id: device.device_id,
      timestamp: now,
      parameter: "Power",
      value: toDecimal(+(powerKw.toFixed(4))),
      unit: "kW",
    },
  });

  return { siteId, timestamp: now, irradiance, ambient, moduleTemp: mtemp, powerKw };
}

// API: start simulation for site (writes every intervalMs)
app.post("/sites/:id/simulate/start", async (req, res) => {
  const siteId = Number(req.params.id);
  const intervalMs = Number(req.body.intervalMs ?? 5000);

  if (simulators.has(siteId)) return res.status(400).json({ error: "Simulation already running for this site" });

  // quick validation
  const site = await prisma.site.findUnique({ where: { site_id: siteId } });
  if (!site) return res.status(404).json({ error: "Site not found" });

  const timer = setInterval(async () => {
    try {
      const p = await generateTelemetryPointForSite(siteId);
      console.log("sim:", siteId, p.timestamp.toISOString(), `${p.powerKw.toFixed(3)} kW`);
    } catch (err) {
      console.error("sim error:", err);
    }
  }, intervalMs);

  simulators.set(siteId, timer);
  res.json({ started: true, siteId, intervalMs });
});

app.post("/sites/:id/simulate/stop", (req, res) => {
  const siteId = Number(req.params.id);
  const timer = simulators.get(siteId);
  if (!timer) return res.status(404).json({ error: "No simulation running for this site" });
  clearInterval(timer);
  simulators.delete(siteId);
  res.json({ stopped: true, siteId });
});

app.post("/sites/:id/simulate/seed", async (req, res) => {
  const siteId = Number(req.params.id);
  const points = Number(req.body.points ?? 24);
  const site = await prisma.site.findUnique({ where: { site_id: siteId } });
  if (!site) return res.status(404).json({ error: "Site not found" });
  const capKw = site.capacity_kw ? Number(site.capacity_kw.toString()) : 1.0;

  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const device = await ensureSiteDevice(siteId);

  const created: any[] = [];
  for (let i = 0; i < points; i++) {
    const hour = (i * 24) / points; // spread across 0..24
    const timestamp = new Date(base.getTime() + Math.round(hour * 3600 * 1000));
    const irradiance = irradianceAtHour(hour);
    const ambient = 20 + 10 * Math.sin((2 * Math.PI / 24) * hour - Math.PI / 2);
    const mtemp = moduleTemp(ambient, irradiance);
    const pKw = computeACPowerKw(capKw, irradiance, -0.004, mtemp, 0.95);
    await prisma.weatherData.create({
      data: {
        site_id: siteId,
        timestamp,
        irradiance_wm2: toDecimal(+(irradiance.toFixed(2))),
        ambient_temp_c: toDecimal(+(ambient.toFixed(2))),
        module_temp_c: toDecimal(+(mtemp.toFixed(2))),
        wind_speed_ms: toDecimal(0),
        wind_dir_deg: toDecimal(0),
      },
    });
    const t = await prisma.telemetry.create({
      data: {
        device_type: "SIMULATED_INVERTER",
        device_id: device.device_id,
        timestamp,
        parameter: "Power",
        value: toDecimal(+(pKw.toFixed(4))),
        unit: "kW",
      },
    });
    created.push(t);
  }

  res.json({ created: created.length });
});

app.get("/sites/:id/telemetry", async (req, res) => {
  const siteId = Number(req.params.id);
  const limit = Number(req.query.limit ?? 200);
  // join telemetry -> device -> site? We create device per site, so filter by device.name
  const device = await prisma.device.findFirst({ where: { name: `sim-site-${siteId}` } });
  if (!device) return res.json([]);
  const data = await prisma.telemetry.findMany({
    where: { device_id: device.device_id },
    orderBy: { timestamp: "desc" },
    take: limit,
  });
  res.json(data.map(d => {
    // convert Decimal and BigInt for JSON safety
    return {
      telemetry_id: d.telemetry_id.toString(), // BigInt -> string
      timestamp: d.timestamp,
      parameter: d.parameter,
      value: d.value ? d.value.toString() : null,
      unit: d.unit,
    };
  }));
});

app.get("/", (req, res) => res.send("Server is running"));

app.listen(PORT, () => {
  console.log(`Server ready at http://localhost:${PORT}`);
});
