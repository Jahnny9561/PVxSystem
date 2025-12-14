// src/index.ts

import express from "express";
import dotenv from "dotenv";
import { prisma } from "./prisma/client";
import { Prisma } from "@prisma/client";
import { WebSocketServer } from "ws";

dotenv.config();
const app = express();
app.use(express.json());

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

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

// create a virtual device used for telemetry rows if none present
async function ensureSiteDevice(siteId: number) {
    // see the Device table: device.type = "SIMULATED_INVERTER"
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

function computeSitePhysics(site: { capacity_kw: Prisma.Decimal | null }, timestamp: Date) {
  const capKw = site.capacity_kw
    ? Number(site.capacity_kw.toString())
    : 1.0;

  const hour =
    (timestamp.getHours() % 24) + timestamp.getMinutes() / 60;

  const irradiance = irradianceAtHour(hour);
  const ambient =
    20 + 10 * Math.sin((2 * Math.PI / 24) * hour - Math.PI / 2);
  const moduleTempC = moduleTemp(ambient, irradiance);

  const powerKw = computeACPowerKw(
    capKw,
    irradiance,
    -0.004,
    moduleTempC,
    0.95
  );

  const noisyPowerKw = Math.max(
    0,
    powerKw + Math.random() * 0.2
  );

  const windSpeed = Math.random() * 10;
  const windDir = Math.random() * 360;

  return {
    hour,
    irradiance,
    ambient,
    moduleTempC,
    powerKw: noisyPowerKw,
    windSpeed,
    windDir,
  };
}

// generate a single telemetry point for a site
async function generateTelemetryPointForSite(siteId: number) {
  const site = await prisma.site.findUnique({
    where: { site_id: siteId },
  });
  if (!site) throw new Error("Site not found");

  const now = new Date();
  const device = await ensureSiteDevice(siteId);

  const physics = computeSitePhysics(site, now);

  await prisma.weatherData.create({
    data: {
      site_id: siteId,
      timestamp: now,
      irradiance_wm2: toDecimal(+physics.irradiance.toFixed(2)),
      ambient_temp_c: toDecimal(+physics.ambient.toFixed(2)),
      module_temp_c: toDecimal(+physics.moduleTempC.toFixed(2)),
      wind_speed_ms: toDecimal(+physics.windSpeed.toFixed(2)),
      wind_dir_deg: toDecimal(+physics.windDir.toFixed(2)),
    },
  });

  await prisma.telemetry.create({
    data: {
      device_type: "SIMULATED_INVERTER",
      device_id: device.device_id,
      timestamp: now,
      parameter: "Power",
      value: toDecimal(+physics.powerKw.toFixed(4)),
      unit: "kW",
    },
  });

  return { siteId, timestamp: now, ...physics };
}

function shutdown() {
    console.log("Shutting down...");
    for (const [siteId, timer] of simulators.entries()) {
        if (timer) {
            clearInterval(timer);
            console.log(`Stopped simulation for site ${siteId}`);
        }
    }
    simulators.clear();
    prisma.$disconnect().finally(() => process.exit(0));
}

// API: start simulation for site (writes every intervalMs)
app.post("/sites/:id/simulate/start", async (req, res) => {
    const siteId = Number(req.params.id);
    const intervalMs = Number(req.body.intervalMs ?? 15000);

    if (!Number.isFinite(siteId)) {
        return res.status(400).json({ error: "Invalid site id" });
    }

    if (simulators.has(siteId)) {
        return res.status(400).json({ error: "Simulation already running" });
    }

    // reserve immediately (race-safe)
    simulators.set(siteId, null as unknown as ReturnType<typeof setInterval>);

    try {
        const site = await prisma.site.findUnique({
            where: { site_id: siteId },
        });

        if (!site) {
            simulators.delete(siteId);
            return res.status(404).json({ error: "Site not found" });
        }

        const timer = setInterval(async () => {
            try {
                const p = await generateTelemetryPointForSite(siteId);

                console.log(
                    "sim:",
                    siteId,
                    p.timestamp.toISOString(),
                    `${p.powerKw.toFixed(3)} kW`
                );

                const payload = {
                    siteId,
                    timestamp: p.timestamp,
                    powerKw: p.powerKw,
                };

                wss.clients.forEach(client => {
                    if (client.readyState === 1) {
                        client.send(JSON.stringify(payload));
                    }
                });
            } catch (err) {
                console.error("sim error:", err);
            }
        }, intervalMs);

        simulators.set(siteId, timer);
        res.json({ started: true, siteId, intervalMs });

    } catch (err) {
        simulators.delete(siteId);
        console.error(err);
        res.status(500).json({ error: "Failed to start simulation" });
    }
});

app.post("/sites/:id/simulate/stop", (req, res) => {
    const siteId = Number(req.params.id);
    const timer = simulators.get(siteId);

    if (!timer) {
        simulators.delete(siteId);
        return res.status(404).json({ error: "No simulation running for this site" });
    }

    clearInterval(timer);
    simulators.delete(siteId);

    res.json({ stopped: true, siteId });
});

app.post("/sites/:id/simulate/seed", async (req, res) => {
    try {
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
            const hour = (i * 24) / points;
            const timestamp = new Date(
                base.getTime() + Math.round(hour * 3600 * 1000)
            );

            const physics = computeSitePhysics(site, timestamp);

            await prisma.weatherData.create({
                data: {
                    site_id: siteId,
                    timestamp,
                    irradiance_wm2: toDecimal(+physics.irradiance.toFixed(2)),
                    ambient_temp_c: toDecimal(+physics.ambient.toFixed(2)),
                    module_temp_c: toDecimal(+physics.moduleTempC.toFixed(2)),
                    wind_speed_ms: toDecimal(+physics.windSpeed.toFixed(2)),
                    wind_dir_deg: toDecimal(+physics.windDir.toFixed(2)),
                },
            });

            const t = await prisma.telemetry.create({
                data: {
                    device_type: "SIMULATED_INVERTER",
                    device_id: device.device_id,
                    timestamp,
                    parameter: "Power",
                    value: toDecimal(+physics.powerKw.toFixed(4)),
                    unit: "kW",
                },
            });

            created.push(t);
        }
        res.json({ created: created.length });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to seed telemetry" });
    }
});

app.get("/sites/:id/telemetry", async (req, res) => {
    const siteId = Number(req.params.id);
    const limit = Number(req.query.limit ?? 200);
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

const server = app.listen(PORT, () => {
    console.log(`Server ready at http://localhost:${PORT}`);
});

const wss = new WebSocketServer({ server });

wss.on("connection", ws => {
    console.log("WS client connected");
});

process.on("SIGINT", shutdown); // Ctrl+C
process.on("SIGTERM", shutdown); // Docker / system stop
