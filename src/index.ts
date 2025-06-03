import express from "express"
import cors from "cors"
import morgan from "morgan"
import emailRoutes from "./routes/email"

const app = express()
// Update the PORT configuration to use the Vercel environment variable
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())
app.use(morgan("combined"))

// Routes
app.use("/api", emailRoutes)

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Error:", err.message)
  res.status(500).json({
    error: "Internal server error",
    message: err.message,
  })
})

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
  })
})

// Start the server in all environments
app.listen(PORT, () => {
  console.log(`🚀 Email Validator API running on port ${PORT}`)
  console.log(`📊 Health check: http://localhost:${PORT}/health`)
  console.log(`📧 Validate emails: POST http://localhost:${PORT}/api/validate-email`)
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`)
  console.log(`🔧 Serverless: ${!!(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME)}`)
})

export default app
  