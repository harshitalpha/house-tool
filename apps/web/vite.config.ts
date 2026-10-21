import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { feedbackPlugin } from "./feedback-plugin";

export default defineConfig({ plugins: [react(), feedbackPlugin()] });
