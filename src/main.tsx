import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { applyAccentColor } from "./utils/accent";
import App from "./App";
import Settings from "./Settings";
import Toast from "./Toast";
import Onboarding from "./Onboarding";
import "./App.css";

applyAccentColor().finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/toast" element={<Toast />} />
        </Routes>
      </BrowserRouter>
    </React.StrictMode>,
  );
});
