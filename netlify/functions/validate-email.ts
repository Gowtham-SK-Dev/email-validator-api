import { validateSyntax } from "../../src/utils/validateSyntax"
import { validateMx } from "../../src/utils/validateMx"
import { validateSmtp } from "../../src/utils/validateSmtp"
import { isDisposableDomain } from "../../src/utils/isDisposableDomain"
import { isRoleEmail } from "../../src/utils/isRoleEmail"

const CACHE_TTL = 5 * 60 * 1000
const responseCache = new Map<string, { timestamp: number; value: any }>()

type NetlifyEvent = {
  httpMethod: string
  body: string | null
}
type NetlifyResponse = {
  statusCode: number
  headers?: Record<string, string>
  body: string
}

export const handler = async (event: NetlifyEvent, _context?: unknown): Promise<NetlifyResponse> => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    }
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Method not allowed. Use POST." }),
    }
  }

  let email: string
  let checkInboxLegacy = true
  let tests: { smtp?: boolean; mx?: boolean; disposableDomain?: boolean; roleBased?: boolean } | undefined
  try {
    const raw = event.body ?? "{}"
    const body = JSON.parse(raw) as any
    email = body.email
    if (typeof body.checkInbox === "boolean") {
      checkInboxLegacy = body.checkInbox
    }
    if (body.tests && typeof body.tests === "object") {
      tests = body.tests
    }
  } catch {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Invalid JSON body" }),
    }
  }

  if (!email || typeof email !== "string") {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Email is required and must be a string" }),
    }
  }

  const enableSmtp = typeof tests?.smtp === "boolean" ? tests.smtp : checkInboxLegacy
  const enableMx = typeof tests?.mx === "boolean" ? tests.mx : true
  const enableDisposable = typeof tests?.disposableDomain === "boolean" ? tests.disposableDomain : true
  const enableRole = typeof tests?.roleBased === "boolean" ? tests.roleBased : true

  const cacheKey = `${email}|smtp:${enableSmtp ? 1 : 0}|mx:${enableMx ? 1 : 0}|disp:${enableDisposable ? 1 : 0}|role:${enableRole ? 1 : 0}`
  const cached = responseCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(cached.value),
    }
  }

  const response = {
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

  // 1) Syntax
  const syntaxResult = validateSyntax(email)
  response.results.syntax = syntaxResult
  if (!syntaxResult.passed) {
    response.valid = false
    responseCache.set(cacheKey, { timestamp: Date.now(), value: response })
    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(response),
    }
  }

  const domain = email.split("@")[1]?.toLowerCase()
  const isGmail = domain === "gmail.com"

  // 2) Role-based
  if (enableRole) {
    if (isGmail) {
      response.results.roleBased = { passed: true, message: "Gmail addresses are not checked for role-based patterns" }
    } else {
      const roleResult = isRoleEmail(email)
      response.results.roleBased = roleResult
      if (!roleResult.passed) {
        response.valid = false
        responseCache.set(cacheKey, { timestamp: Date.now(), value: response })
        return {
          statusCode: 200,
          headers: { "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify(response),
        }
      }
    }
  }

  // 3/4) Disposable + MX
  if (isGmail) {
    if (enableDisposable)
      response.results.disposableDomain = { passed: true, message: "Gmail is not a disposable domain" }
    if (enableMx) response.results.mx = { passed: true, message: "Gmail has valid MX records" }
  } else {
    const tasks: Promise<any>[] = []
    if (enableDisposable) tasks.push(isDisposableDomain(email).then((r) => (response.results.disposableDomain = r)))
    if (enableMx) tasks.push(validateMx(email).then((r) => (response.results.mx = r)))
    if (tasks.length) await Promise.all(tasks)

    if ((enableDisposable && !response.results.disposableDomain.passed) || (enableMx && !response.results.mx.passed)) {
      response.valid = false
      responseCache.set(cacheKey, { timestamp: Date.now(), value: response })
      return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify(response),
      }
    }
  }

  // 5) SMTP
  if (enableSmtp) {
    const smtpResult = await validateSmtp(email)
    response.results.smtp = smtpResult
  }

  response.valid =
    response.results.syntax.passed &&
    (!enableRole || response.results.roleBased.passed) &&
    (!enableDisposable || response.results.disposableDomain.passed) &&
    (!enableMx || response.results.mx.passed) &&
    (!enableSmtp || response.results.smtp.passed)

  responseCache.set(cacheKey, { timestamp: Date.now(), value: response })
  return {
    statusCode: 200,
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(response),
  }
}
