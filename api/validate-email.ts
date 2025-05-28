import { validateSyntax } from "../src/utils/validateSyntax"
import { validateMx } from "../src/utils/validateMx"
import { validateSmtp } from "../src/utils/validateSmtp"
import { isDisposableDomain } from "../src/utils/isDisposableDomain"
import { isRoleEmail } from "../src/utils/isRoleEmail"
import type { VercelRequest, VercelResponse } from "@vercel/node"

interface ValidationResult {
  passed: boolean
  message: string
  records?: any[]
  confidence?: number
  inboxValidation?: any
}

interface EmailValidationResponse {
  email: string
  valid: boolean
  results: {
    syntax: ValidationResult
    mx: ValidationResult
    smtp: ValidationResult
    disposableDomain: ValidationResult
    roleBased: ValidationResult
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. Use POST.",
    })
  }

  try {
    const { email, checkInbox = true } = req.body

    if (!email || typeof email !== "string") {
      return res.status(400).json({
        error: "Email is required and must be a string",
      })
    }

    const response: EmailValidationResponse = {
      email,
      valid: false,
      results: {
        syntax: { passed: false, message: "" },
        mx: { passed: false, message: "" },
        smtp: { passed: false, message: "" },
        disposableDomain: { passed: false, message: "" },
        roleBased: { passed: false, message: "" },
      },
    }

    // 1. Syntax validation (first check)
    const syntaxResult = validateSyntax(email)
    response.results.syntax = syntaxResult

    if (!syntaxResult.passed) {
      response.valid = false
      return res.json(response)
    }

    // 2. Role-based email check
    const roleResult = isRoleEmail(email)
    response.results.roleBased = roleResult

    if (!roleResult.passed) {
      response.valid = false
      return res.json(response)
    }

    // 3. Disposable domain check
    const disposableResult = await isDisposableDomain(email)
    response.results.disposableDomain = disposableResult

    if (!disposableResult.passed) {
      response.valid = false
      return res.json(response)
    }

    // 4. MX record validation
    const mxResult = await validateMx(email)
    response.results.mx = mxResult

    if (!mxResult.passed) {
      response.valid = false
      return res.json(response)
    }

    // 5. SMTP mailbox validation with inbox checking
    const smtpResult = await validateSmtp(email)
    response.results.smtp = smtpResult

    // Final validation result - ALL checks must pass
    response.valid =
      syntaxResult.passed && roleResult.passed && disposableResult.passed && mxResult.passed && smtpResult.passed

    res.json(response)
  } catch (error) {
    console.error("Validation error:", error)
    res.status(500).json({
      error: "Internal server error during validation",
      message: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
