import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { SessionProvider } from "@/context/SessionContext";
import { FilterProvider } from "@/context/FilterContext";
import { ToastProvider } from "@/context/ToastContext";
import { DrillProvider } from "@/context/DrillContext";
import { SpeedInsightsRoute } from "@/components/SpeedInsightsRoute";
import { ViewAsBanner } from "@/components/ViewAsBanner";
import { SimulationBanner } from "@/components/SimulationBanner";
import "@/styles/tokens.css";
import "@/styles/base.css";
import "@/styles/components.css";
import "@/styles/shell.css";
import "@/styles/dashboard.css";
import "@/styles/access.css";
import "@/styles/approvals.css";
import "@/styles/masters.css";
import "@/styles/members.css";
import "@/styles/schemes.css";
import "@/styles/wallet.css";
import "@/styles/gifts.css";
import "@/styles/risk.css";
import "@/styles/ops.css";
import "@/styles/analytics.css";
import "@/styles/platform.css";
import "@/styles/jobs.css";
import "@/styles/demo.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SessionProvider>
        <FilterProvider>
          <ToastProvider>
            <DrillProvider>
              <SimulationBanner />
              <ViewAsBanner />
              <App />
            </DrillProvider>
          </ToastProvider>
        </FilterProvider>
      </SessionProvider>
      <SpeedInsightsRoute />
    </BrowserRouter>
  </StrictMode>,
);
