import express from "express"
import { validateSyntax } from "../utils/validateSyntax"
import { validateMx } from "../utils/validateMx"
import { validateSmtp } from "../utils/validateSmtp"
import { isDisposableDomain } from "../utils/isDisposableDomain"
import { isRoleEmail } from "../utils/isRoleEmail"

const router = express.Router()

interface MxRecordWithIp {
  exchange: string
  priority: number
  ipAddresses?: string[]
}

interface ValidationResult {
  passed: boolean
  message: string
  records?: MxRecordWithIp[]
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

router.post("/validate-email", async (req, res) => {
  try {
    const { email } = req.body

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

    // Check if it's a Gmail address
    const domain = email.split("@")[1]?.toLowerCase()
    const isGmail = domain === "gmail.com"

    // 2. Role-based email check (skip for Gmail)
    if (!isGmail) {
      const roleResult = isRoleEmail(email)
      response.results.roleBased = roleResult

      if (!roleResult.passed) {
        response.valid = false
        return res.json(response)
      }
    } else {
      // Auto-pass role check for Gmail
      response.results.roleBased = { passed: true, message: "Gmail addresses are not checked for role-based patterns" }
    }

    // 3. Disposable domain check (skip for Gmail)
    if (!isGmail) {
      const disposableResult = await isDisposableDomain(email)
      response.results.disposableDomain = disposableResult

      if (!disposableResult.passed) {
        response.valid = false
        return res.json(response)
      }
    } else {
      // Auto-pass disposable check for Gmail
      response.results.disposableDomain = { passed: true, message: "Gmail is not a disposable domain" }
    }

    // 4. MX record validation (skip for Gmail)
    if (!isGmail) {
      const mxResult = await validateMx(email)
      response.results.mx = mxResult

      if (!mxResult.passed) {
        response.valid = false
        return res.json(response)
      }
    } else {
      // Auto-pass MX check for Gmail
      response.results.mx = { passed: true, message: "Gmail has valid MX records" }
    }

    // 5. SMTP mailbox validation
    const smtpResult = await validateSmtp(email)
    response.results.smtp = smtpResult

    // Final validation result - ALL checks must pass
    response.valid =
      syntaxResult.passed &&
      response.results.roleBased.passed &&
      response.results.disposableDomain.passed &&
      response.results.mx.passed &&
      smtpResult.passed

    res.json(response)
    return
  } catch (error) {
    console.error("Validation error:", error)
    res.status(500).json({
      error: "Internal server error during validation",
      message: error instanceof Error ? error.message : "Unknown error",
    })
    return
  }
})

export default router
