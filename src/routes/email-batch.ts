import express from "express"
import { testGoogleSigninBatch } from "../utils/googleSigninTest"
import { validateSyntax } from "../utils/validateSyntax"
import { performanceMonitor } from "../utils/performance-monitor"

const router: express.Router = express.Router()

// Batch validation endpoint for processing multiple emails efficiently
router.post("/validate-emails-batch", async (req: express.Request, res: express.Response): Promise<void> => {
  const startTime = Date.now()

  try {
    const { emails } = req.body

    if (!emails || !Array.isArray(emails)) {
      res.status(400).json({
        error: "Emails array is required",
      })
      return
    }

    if (emails.length > 50) {
      res.status(400).json({
        error: "Maximum 50 emails allowed per batch",
      })
      return
    }

    // Validate syntax for all emails first (fast operation)
    const validEmails: string[] = []
    const results: any[] = []

    for (const email of emails) {
      if (typeof email !== "string") {
        results.push({
          email,
          valid: false,
          error: "Email must be a string",
        })
        continue
      }

      const syntaxResult = validateSyntax(email)
      if (!syntaxResult.passed) {
        results.push({
          email,
          valid: false,
          error: syntaxResult.message,
        })
        continue
      }

      validEmails.push(email)
    }

    // Process Gmail addresses in batch
    const gmailEmails = validEmails.filter((email) => email.endsWith("@gmail.com"))
    const otherEmails = validEmails.filter((email) => !email.endsWith("@gmail.com"))

    // Batch process Gmail addresses
    if (gmailEmails.length > 0) {
      console.log(`📧 Processing ${gmailEmails.length} Gmail addresses in batch`)
      const gmailResults = await testGoogleSigninBatch(gmailEmails)

      for (const email of gmailEmails) {
        const result = gmailResults.get(email)
        results.push({
          email,
          valid: result?.status === "success",
          message: result?.message || "Unknown result",
          status: result?.status || "unknown",
        })
      }
    }

    // Process other emails (simplified validation for speed)
    for (const email of otherEmails) {
      results.push({
        email,
        valid: true, // Assume valid if syntax passes (for speed)
        message: "Syntax validation passed",
        status: "syntax_only",
      })
    }

    const totalTime = Date.now() - startTime
    const successCount = results.filter((r) => r.valid).length

    // Record performance metrics
    performanceMonitor.recordValidation(totalTime, true)

    res.json({
      totalEmails: emails.length,
      validEmails: successCount,
      invalidEmails: emails.length - successCount,
      processingTime: totalTime,
      results,
    })
    return
  } catch (error) {
    const totalTime = Date.now() - startTime
    performanceMonitor.recordValidation(totalTime, false)

    console.error("Batch validation error:", error)
    res.status(500).json({
      error: "Internal server error during batch validation",
      message: error instanceof Error ? error.message : "Unknown error",
    })
    return
  }
})

// Performance metrics endpoint
router.get("/performance-metrics", (req: express.Request, res: express.Response): void => {
  const metrics = performanceMonitor.getDetailedStats()
  res.json(metrics)
})

export default router
