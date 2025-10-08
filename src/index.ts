import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";

import emailRoutes from "./routes/email";
import batchRoutes from "./routes/email-batch";
import { cleanupGoogleSigninTest } from "./utils/googleSigninTest";

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(morgan("combined"));

// --- Routes ---
app.use("/api", emailRoutes);          // POST /api/validate-email
app.use("/api", batchRoutes);          // POST /api/validate-emails-batch

// --- Health check ---
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: "1.0.0",
  });
});

// --- Error handling ---
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Error:", err.message);
  res.status(500).json({
    error: "Internal server error",
    message: err.message,
  });
});

// --- 404 handler ---
app.use("*", (_req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found" });
});

// --- Graceful shutdown ---
const shutdown = async () => {
  console.log("🔄 Graceful shutdown: cleaning up...");
  await cleanupGoogleSigninTest();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// --- Start server ---
app.listen(PORT, () => {
  console.log(`🚀 Email Validator API running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📧 Validate emails: POST http://localhost:${PORT}/api/validate-email`);
  console.log(`📧 Batch validate: POST http://localhost:${PORT}/api/validate-emails-batch`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🔧 Serverless: ${!!(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME)}`);
});

export default app;
