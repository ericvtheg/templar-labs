import "@fontsource-variable/dm-sans/index.css";
import "@fontsource/newsreader/400.css";
import "@fontsource/newsreader/400-italic.css";
import "@fontsource/newsreader/500.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("The app root was not found.");
}
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
