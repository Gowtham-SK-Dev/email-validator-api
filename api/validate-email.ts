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

const CACHE_TTL = 5 * 60 * 1000
const responseCache = new Map<string, { timestamp: number; value: EmailValidationResponse }>()

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
    const { email, checkInbox: checkInboxLegacy = true, tests } = req.body || {}

    if (!email || typeof email !== "string") {
      return res.status(400).json({
        error: "Email is required and must be a string",
      })
    }

    // Normalize tests flags. Syntax always runs first (cannot be disabled).
    const enableSmtp = typeof tests?.smtp === "boolean" ? tests.smtp : checkInboxLegacy
    const enableMx = typeof tests?.mx === "boolean" ? tests.mx : true
    const enableDisposable = typeof tests?.disposableDomain === "boolean" ? tests.disposableDomain : true
    const enableRole = typeof tests?.roleBased === "boolean" ? tests.roleBased : true

    // Cache key per email + tests selection
    const cacheKey = `${email}|smtp:${enableSmtp ? 1 : 0}|mx:${enableMx ? 1 : 0}|disp:${enableDisposable ? 1 : 0}|role:${enableRole ? 1 : 0}`
    const cached = responseCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json(cached.value)
    }

    const response: EmailValidationResponse = {
      email,
      valid: false,
      results: {
        syntax: { passed: false, message: "" },
        mx: { passed: !enableMx, message: enableMx ? "" : "Skipped MX check (by request)" },
        smtp: { passed: !enableSmtp, message: enableSmtp ? "" : "Skipped SMTP check (by request)" },
        disposableDomain: {
          passed: !enableDisposable,
          message: enableDisposable ? "" : "Skipped disposable-domain check (by request)",
        },
        roleBased: { passed: !enableRole, message: enableRole ? "" : "Skipped role-based check (by request)" },
      },
    }

    // 1) Syntax (always run first)
    const syntaxResult = validateSyntax(email)
    response.results.syntax = syntaxResult
    if (!syntaxResult.passed) {
      response.valid = false
      responseCache.set(cacheKey, { timestamp: Date.now(), value: response })
      return res.json(response)
    }

    const domain = email.split("@")[1]?.toLowerCase()
    const isGmail = domain === "gmail.com"

    // 2) Role-based
    if (enableRole) {
      if (isGmail) {
        response.results.roleBased = {
          passed: true,
          message: "Gmail addresses are not checked for role-based patterns",
        }
      } else {
        const roleResult = isRoleEmail(email)
        response.results.roleBased = roleResult
        if (!roleResult.passed) {
          response.valid = false
          responseCache.set(cacheKey, { timestamp: Date.now(), value: response })
          return res.json(response)
        }
      }
    }

    // 3) Disposable + 4) MX
    if (isGmail) {
      if (enableDisposable) {
        response.results.disposableDomain = { passed: true, message: "Gmail is not a disposable domain" }
      }
      if (enableMx) {
        response.results.mx = { passed: true, message: "Gmail has valid MX records" }
      }
    } else {
      const promises: Array<Promise<void>> = []
      if (enableDisposable) {
        promises.push(
          isDisposableDomain(email).then((disposableResult) => {
            response.results.disposableDomain = disposableResult
          }),
        )
      }
      if (enableMx) {
        promises.push(
          validateMx(email).then((mxResult) => {
            response.results.mx = mxResult
          }),
        )
      }
      if (promises.length) {
        await Promise.all(promises)
      }
      if (
        (enableDisposable && !response.results.disposableDomain.passed) ||
        (enableMx && !response.results.mx.passed)
      ) {
        response.valid = false
        responseCache.set(cacheKey, { timestamp: Date.now(), value: response })
        return res.json(response)
      }
    }

    // 5) SMTP
    if (enableSmtp) {
      const smtpResult = await validateSmtp(email)
      response.results.smtp = smtpResult
    } // else left as "Skipped SMTP check (by request)"

    // Compute final valid based only on enabled checks
    response.valid =
      response.results.syntax.passed &&
      (!enableRole || response.results.roleBased.passed) &&
      (!enableDisposable || response.results.disposableDomain.passed) &&
      (!enableMx || response.results.mx.passed) &&
      (!enableSmtp || response.results.smtp.passed)

    // Cache
    responseCache.set(cacheKey, { timestamp: Date.now(), value: response })
    return res.json(response)
  } catch (error) {
    console.error("Validation error:", error)
    res.status(500).json({
      error: "Internal server error during validation",
      message: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
