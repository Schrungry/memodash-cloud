import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// MemoDash · 记忆日常 —— 纯客户端 SPA 构建（WorkBuddy Sites 静态托管）。
// 认证与用户数据全部走 @tencent-ai/workbuddy-cloud-sdk，词书为 public/ 静态资源。
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1500,
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
