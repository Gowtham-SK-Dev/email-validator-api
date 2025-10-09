import express, { Router, Request, Response } from "express"
import { validateSyntax } from "../utils/validateSyntax"
import { validateMx } from "../utils/validateMx"
import { validateSmtp } from "../utils/validateSmtp"
import { isDisposableDomain } from "../utils/isDisposableDomain"
import { isRoleEmail } from "../utils/isRoleEmail"

const router: Router = express.Router() // explicit type annotation

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

const CACHE_TTL = 5 * 60 * 1000
const responseCache = new Map<
  string,
  {
    timestamp: number
    value: EmailValidationResponse
  }
>()

router.post("/validate-email", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, checkInbox: checkInboxLegacy = true, tests } = req.body

    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "Email is required and must be a string" })
      return
    }

    const enableSmtp = typeof tests?.smtp === "boolean" ? tests.smtp : checkInboxLegacy
    const enableMx = typeof tests?.mx === "boolean" ? tests.mx : true
    const enableDisposable = typeof tests?.disposableDomain === "boolean" ? tests.disposableDomain : true
    const enableRole = typeof tests?.roleBased === "boolean" ? tests.roleBased : true

    const cacheKey = `${email}|smtp:${enableSmtp ? 1 : 0}|mx:${enableMx ? 1 : 0}|disp:${enableDisposable ? 1 : 0}|role:${enableRole ? 1 : 0}`
    const cached = responseCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      res.json(cached.value)
      return
    }

    const response: EmailValidationResponse = {
      email,
      valid: false,
      results: {
        syntax: { passed: false, message: "" },
        mx: { passed: !enableMx, message: enableMx ? "" : "Skipped MX check (by request)" },
        smtp: { passed: !enableSmtp, message: enableSmtp ? "" : "Skipped SMTP check (by request)" },
        disposableDomain: { passed: !enableDisposable, message: enableDisposable ? "" : "Skipped disposable-domain check (by request)" },
        roleBased: { passed: !enableRole, message: enableRole ? "" : "Skipped role-based check (by request)" },
      },
    }

    // Syntax validation
    const syntaxResult = validateSyntax(email)
    response.results.syntax = syntaxResult
    if (!syntaxResult.passed) {
      response.valid = false
      responseCache.set(cacheKey, { timestamp: Date.now(), value: response })
      res.json(response)
      return
    }

    const domain = email.split("@")[1]?.toLowerCase()
    const isGmail = domain === "gmail.com"

    // Role-based validation
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
          res.json(response)
          return
        }
      }
    }

    // Gmail shortcut
    if (isGmail) {
      if (enableDisposable) response.results.disposableDomain = { passed: true, message: "Gmail is not a disposable domain" }
      if (enableMx) response.results.mx = { passed: true, message: "Gmail has valid MX records" }
    } else {
      const tasks: Promise<void>[] = []

      if (enableDisposable)
        tasks.push(
          isDisposableDomain(email).then((r) => {
            response.results.disposableDomain = r
            return // <-- explicitly return void
          })
        )
      if (enableMx)
        tasks.push(
          validateMx(email).then((r) => {
            response.results.mx = r
            return // <-- explicitly return void
          })
        )

      if (tasks.length) await Promise.all(tasks)

      if ((enableDisposable && !response.results.disposableDomain.passed) || (enableMx && !response.results.mx.passed)) {
        response.valid = false
        responseCache.set(cacheKey, { timestamp: Date.now(), value: response })
        res.json(response)
        return
      }
    }

    // SMTP validation
    if (enableSmtp) {
      const smtpResult = await validateSmtp(email)
      response.results.smtp = smtpResult
    }

    // Compute final validity
    response.valid =
      response.results.syntax.passed &&
      (!enableRole || response.results.roleBased.passed) &&
      (!enableDisposable || response.results.disposableDomain.passed) &&
      (!enableMx || response.results.mx.passed) &&
      (!enableSmtp || response.results.smtp.passed)

    responseCache.set(cacheKey, { timestamp: Date.now(), value: response })
    res.json(response)
    return
  } catch (error: unknown) {
    // Handle unknown error
    if (error instanceof Error) {
      console.error("Validation error:", error.message)
    } else {
      console.error("Validation error:", error)
    }
    res.status(500).json({
      error: "Internal server error during validation",
      message: error instanceof Error ? error.message : "Unknown error",
    })
    return
  }
})

export default router
