import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { I18nProvider } from "./i18n";
import { AppRoutes } from "./terminal/App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/*" element={<AppRoutes />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  </React.StrictMode>
);
