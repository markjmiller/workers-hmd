import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./common.css";
import "@fortawesome/fontawesome-free/css/all.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
