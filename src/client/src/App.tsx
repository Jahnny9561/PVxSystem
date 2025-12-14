import { useState, useMemo } from "react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import Dashboard from "./Dashboard";

export default function App() {
  const [mode, setMode] = useState<"light" | "dark">("dark");

  const colorMode = useMemo(
    () => ({
      toggleColorMode: () => {
        setMode((prevMode) => (prevMode === "light" ? "dark" : "light"));
      },
    }),
    []
  );

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          ...(mode === "light"
            ? {
                background: { default: "#f5f7fa", paper: "#ffffff" },
                text: { primary: "#1e293b", secondary: "#64748b" },
              }
            : {
                background: { default: "#0f172a", paper: "#1e293b" },
                text: { primary: "#f8fafc", secondary: "#94a3b8" },
              }),
        },
        typography: {
          fontFamily: "Inter, Roboto, sans-serif",
        },
        components: {
          MuiCard: {
            styleOverrides: {
              root: {
                backgroundImage: "none",
              },
            },
          },
        },
      }),
    [mode]
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {}
      <Dashboard toggleTheme={colorMode.toggleColorMode} mode={mode} />
    </ThemeProvider>
  );
}
