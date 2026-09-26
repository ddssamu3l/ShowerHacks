import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Agentation } from "agentation";
import { App } from "./App";
import "./brand.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    {import.meta.env.DEV && <Agentation />}
  </StrictMode>,
);
