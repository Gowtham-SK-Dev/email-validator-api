// Alternative entry point for environments that prefer .js files
const app = require("./dist/src/index.js").default

const PORT = process.env.PORT || 3000

if (app && typeof app.listen === "function") {
  app.listen(PORT, () => {
    console.log(`🚀 Email Validator API running on port ${PORT}`)
    console.log(`📊 Health check: http://localhost:${PORT}/health`)
    console.log(`📧 Validate emails: POST http://localhost:${PORT}/api/validate-email`)
  })
} else {
  console.error("❌ Failed to start server - app is not properly exported")
}
