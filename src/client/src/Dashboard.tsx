import { useEffect, useState, useRef } from "react";
import axios from "axios";
import {
  Box,
  Container,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  IconButton,
  useTheme,
} from "@mui/material";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

// Icons
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import StopCircleIcon from "@mui/icons-material/StopCircle";
import BoltIcon from "@mui/icons-material/Bolt";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import RefreshIcon from "@mui/icons-material/Refresh";
import WbSunnyIcon from "@mui/icons-material/WbSunny";
import DeviceThermostatIcon from "@mui/icons-material/DeviceThermostat";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import FileDownloadIcon from "@mui/icons-material/FileDownload";

// --- Configuration ---
const API_URL = "http://localhost:3000";
const WS_URL = "ws://localhost:3000";
const SITE_ID = 1;
const INTERVAL_MS = 2000;

interface ChartData {
  timestamp: Date;
  power: number;
}

interface DashboardProps {
  toggleTheme: () => void;
  mode: "light" | "dark";
}

export default function Dashboard({ toggleTheme, mode }: DashboardProps) {
  const theme = useTheme();

  const [powerData, setPowerData] = useState<ChartData[]>([]);
  const [currentPower, setCurrentPower] = useState<number>(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [irradiance, setIrradiance] = useState(0);
  const [temp, setTemp] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const ws = useRef<WebSocket | null>(null);

  function getLast24hRange() {
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    return { from, to };
  }

  const fetchHistory = async (seedIfEmpty?: boolean) => {
    try {
      const { from, to } = getLast24hRange();
      const res = await axios.get(`${API_URL}/sites/${SITE_ID}/telemetry`, {
        params: { from: from.toISOString(), to: to.toISOString() },
      });

      let history: ChartData[] = (res.data || []).map((d: any) => ({
        timestamp: new Date(d.timestamp),
        power: parseFloat(d.value || "0"),
      }));

      // If empty and allowed, create seed data and fetch again
      if ((history.length === 0 || history.every((p) => p.power === 0)) && seedIfEmpty) {
        console.info("No seed data found — creating seed (24 points)...");
        try {
          // create 24 seed points; server endpoint already populates telemetry
          await axios.post(`${API_URL}/sites/${SITE_ID}/simulate/seed`, { points: 24 });
        } catch (e) {
          console.error("Failed to seed telemetry", e);
        }
        // fetch again, but avoid infinite loop by passing seedIfEmpty = false
        return fetchHistory(false);
      }

      setPowerData(history);
      if (history.length > 0) {
        setCurrentPower(history[history.length - 1].power);
      } else {
        setCurrentPower(0);
      }
    } catch (err) {
      console.error("Could not fetch history", err);
    }
  };

  const handleExport = async () => {
    try {
      const { from, to } = getLast24hRange();

      const res = await axios.get(
        `${API_URL}/sites/${SITE_ID}/telemetry`,
        {
          params: {
            from: from.toISOString(),
            to: to.toISOString(),
          },
        }
      );

      const rawData = res.data;
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Solar Data");

      worksheet.columns = [
        { header: "Timestamp", key: "time", width: 25 },
        { header: "Device ID", key: "device", width: 20 },
        { header: "Parameter", key: "param", width: 20 },
        { header: "Value", key: "val", width: 15 },
        { header: "Unit", key: "unit", width: 10 },
      ];

      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E293B" },
      };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.height = 30;

      rawData.forEach((row: any) => {
        const newRow = worksheet.addRow({
          time: new Date(row.timestamp).toLocaleString(),
          device: "Inverter-01",
          param: row.parameter,
          val: Number(row.value),
          unit: row.unit,
        });

        newRow.getCell("unit").alignment = { horizontal: "center" };
        newRow.getCell("val").alignment = { horizontal: "right" };
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveAs(blob, `PV_Report_${new Date().toISOString().split("T")[0]}.xlsx`);
    } catch (e) {
      console.error("Export failed", e);
      alert("Failed to download Excel report");
    }
  };

  useEffect(() => {
    let mounted = true;

    axios
      .get(`${API_URL}/sites/${SITE_ID}/simulate/status`)
      .then((res) => {
        if (!mounted) return;
        const running = !!res.data.running;
        setIsSimulating(running);
        if (!running) {
          fetchHistory(true);
        } else {
          setPowerData([]);
        }
      })
      .catch((err) => {
        console.error("Failed to check status", err);
        fetchHistory(true);
      });

    ws.current = new WebSocket(WS_URL);
    ws.current.onopen = () => setIsConnected(true);
    ws.current.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "STATUS" && payload.siteId === SITE_ID) {
        setIsSimulating(payload.running);
        return;
      }
      if (payload.siteId === SITE_ID) {
        const newPoint: ChartData = {
          timestamp: new Date(payload.timestamp),
          power: Number(payload.powerKw),
        };
        setCurrentPower(newPoint.power);
        setIrradiance(payload.irradiance || 0);
        setTemp(payload.temp || 0);

        setPowerData((prev) => {
          const next = [...prev, newPoint].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
          const cutoff = Date.now() - 24 * 60 * 60 * 1000;
          return next.filter((p) => p.timestamp.getTime() >= cutoff);
        });
      }
    };
    ws.current.onclose = () => setIsConnected(false);

    return () => {
      mounted = false;
      if (ws.current) ws.current.close();
    };
  }, []);

  useEffect(() => {
    if (isSimulating) {
      // Do not clear chart, just append live data
      console.info("Simulation live — keeping previous data");
    }
  }, [isSimulating]);

  const handleStartSim = async () => {
    if (isLoading || isSimulating) return;
    setIsLoading(true);

    try {
      await fetchHistory(false); // fetch last 24h data, if available

      // Find the latest timestamp
      let lastTimestamp = powerData[powerData.length - 1]?.timestamp || new Date();
      const newTimestamp = new Date(lastTimestamp.getTime() + INTERVAL_MS);

      // Start simulation from the last timestamp
      await axios.post(`${API_URL}/sites/${SITE_ID}/simulate/start`, {
        intervalMs: INTERVAL_MS,
        startFrom: newTimestamp.toISOString(), // pass last timestamp to server
      });

      setIsSimulating(true);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopSim = async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      await axios.post(`${API_URL}/sites/${SITE_ID}/simulate/stop`);
      setIsSimulating(false);
    } catch (e: any) {
      if (e.response && e.response.status === 404) {
        setIsSimulating(false);
      } else {
        console.error(e);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box
      sx={{
        bgcolor: "background.default",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        transition: "background 0.3s",
      }}
    >
      <Container maxWidth="xl" sx={{ pt: 4, pb: 4, flex: 1 }}>
        {}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 4,
            bgcolor: "background.paper",
            p: 3,
            borderRadius: 2,
            boxShadow:
              mode === "light"
                ? "0 1px 3px rgba(0,0,0,0.1)"
                : "0 1px 3px rgba(0,0,0,0.5)",
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box>
            <Typography variant="h4" fontWeight="800" color="text.primary">
              PVxSystem Control Center
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
              <Chip
                size="small"
                label={isConnected ? "System Online" : "Connecting..."}
                color={isConnected ? "success" : "default"}
                variant="filled"
              />
              
              {isConnected && (
                <Chip
                  size="small"
                  label={isSimulating ? "Simulation Running" : "Simulation Stopped"}
                  color={isSimulating ? "primary" : "default"}
                  variant="outlined"
                />
              )}

              <Typography variant="caption" color="text.secondary">
                Site ID: {SITE_ID}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
            <Button
              variant="contained"
              onClick={handleStartSim}
              disabled={isSimulating || isLoading}
              startIcon={<PlayCircleIcon />}
            >
              Start
            </Button>

            <Button
              variant="outlined"
              color="error"
              onClick={handleStopSim}
              disabled={!isSimulating || isLoading}
              startIcon={<StopCircleIcon />}
            >
              Stop
            </Button>

            {}
            <Button
              variant="outlined"
              color="primary"
              onClick={handleExport}
              startIcon={<FileDownloadIcon />}
              sx={{ ml: 2, borderColor: "divider", color: "text.secondary" }}
            >
              Export
            </Button>

            <IconButton
              onClick={toggleTheme}
              sx={{
                ml: 1,
                bgcolor:
                  mode === "dark"
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(0,0,0,0.05)",
              }}
            >
              {mode === "dark" ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Box>
        </Box>

        {}
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            justifyContent: "center",
            alignItems: "stretch",
            gap: 3,
            mb: 3,
          }}
        >
          {}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Card
              elevation={0}
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 3,
                height: "100%",
              }}
            >
              <CardContent>
                <Typography
                  variant="h6"
                  fontWeight="bold"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  Conditions
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    mb: 2,
                  }}
                >
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <WbSunnyIcon sx={{ color: "#f59e0b" }} />
                    <Typography fontWeight="500" color="text.primary">
                      Irradiance
                    </Typography>
                  </Box>
                  <Typography
                    variant="h6"
                    fontWeight="bold"
                    color="text.primary"
                  >
                    {irradiance.toFixed(0)} W/m²
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <DeviceThermostatIcon sx={{ color: "#ef4444" }} />
                    <Typography fontWeight="500" color="text.primary">
                      Module Temp
                    </Typography>
                  </Box>
                  <Typography
                    variant="h6"
                    fontWeight="bold"
                    color="text.primary"
                  >
                    {temp.toFixed(1)}°C
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Box>

          {}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Card
              elevation={0}
              sx={{
                background:
                  mode === "light"
                    ? "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)"
                    : "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
                color: "white",
                borderRadius: 3,
                p: 2,
                position: "relative",
                overflow: "hidden",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <BoltIcon
                sx={{
                  position: "absolute",
                  right: -20,
                  top: -20,
                  fontSize: 180,
                  opacity: 0.05,
                }}
              />
              <CardContent>
                <Typography
                  variant="subtitle1"
                  sx={{ opacity: 0.8, mb: 1, letterSpacing: 1 }}
                >
                  CURRENT GENERATION
                </Typography>
                <Typography variant="h2" fontWeight="bold">
                  {currentPower.toFixed(2)}
                  <Typography
                    component="span"
                    variant="h5"
                    sx={{ ml: 1, opacity: 0.8 }}
                  >
                    kW
                  </Typography>
                </Typography>
              </CardContent>
            </Card>
          </Box>

          {}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Card
              elevation={0}
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 3,
                height: "100%",
              }}
            >
              <CardContent>
                <Typography
                  variant="h6"
                  fontWeight="bold"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  System Health
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <Box
                    sx={{
                      height: 50,
                      width: 50,
                      borderRadius: "50%",
                      bgcolor:
                        mode === "light"
                          ? "#ecfdf5"
                          : "rgba(16, 185, 129, 0.1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <ShowChartIcon sx={{ color: "#10b981" }} />
                  </Box>
                  <Box>
                    <Typography
                      variant="h4"
                      fontWeight="bold"
                      color="text.primary"
                    >
                      98.2%
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Inverter Efficiency
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>

        {}
        <Box sx={{ width: "100%", display: "flex", justifyContent: "center" }}>
          <Card
            elevation={0}
            sx={{
              width: "100%",
              height: "500px",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 3,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <CardContent
              sx={{ flex: 1, display: "flex", flexDirection: "column" }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
                <Typography variant="h6" fontWeight="bold" color="text.primary">
                  {isSimulating ? "Real-time Power Output" : "Historical Power Output"}
                </Typography>
                {!isSimulating && (
                  <IconButton onClick={() => fetchHistory()} size="small">
                    <RefreshIcon />
                  </IconButton>
                )}
              </Box>
              <Box sx={{ flexGrow: 1, width: "100%", minHeight: 0 }}>
                <ResponsiveContainer width="99%" height="100%">
                  <AreaChart
                    data={powerData}
                    margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="colorPower"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#0ea5e9"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="#0ea5e9"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={mode === "dark" ? "#334155" : "#f1f5f9"}
                    />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(v) =>
                        new Date(v).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      }
                      tick={{
                        fill: mode === "dark" ? "#94a3b8" : "#64748b",
                        fontSize: 12,
                      }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{
                        fill: mode === "dark" ? "#94a3b8" : "#64748b",
                        fontSize: 12,
                      }}
                      tickLine={false}
                      axisLine={false}
                      unit=" kW"
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "12px",
                        border: "none",
                        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
                        backgroundColor: mode === "dark" ? "#1e293b" : "#fff",
                        color: mode === "dark" ? "#fff" : "#000",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="power"
                      stroke="#0284c7"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorPower)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Container>
    </Box>
  );
}
