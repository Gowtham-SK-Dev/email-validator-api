import { validateSyntax } from "../../src/utils/validateSyntax"
import { validateMx } from "../../src/utils/validateMx"
import { validateSmtp } from "../../src/utils/validateSmtp"
import { isDisposableDomain } from "../../src/utils/isDisposableDomain"
import { isRoleEmail } from "../../src/utils/isRoleEmail"

export const handler = async (event, context) => {
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
  try {
    const body = JSON.parse(event.body || "{}")
    email = body.email
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

  const response = {
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

  // 1. Syntax validation
  const syntaxResult = validateSyntax(email)
  response.results.syntax = syntaxResult
  if (!syntaxResult.passed) {
    response.valid = false
    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(response),
    }
  }

  // 2. Role-based email check
  const roleResult = isRoleEmail(email)
  response.results.roleBased = roleResult
  if (!roleResult.passed) {
    response.valid = false
    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(response),
    }
  }

  // 3. Disposable domain check
  const disposableResult = await isDisposableDomain(email)
  response.results.disposableDomain = disposableResult
  if (!disposableResult.passed) {
    response.valid = false
    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(response),
    }
  }

  // 4. MX record validation
  const mxResult = await validateMx(email)
  response.results.mx = mxResult
  if (!mxResult.passed) {
    response.valid = false
    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(response),
    }
  }

  // 5. SMTP mailbox validation
  const smtpResult = await validateSmtp(email)
  response.results.smtp = smtpResult

  response.valid =
    syntaxResult.passed && roleResult.passed && disposableResult.passed && mxResult.passed && smtpResult.passed

  return {
    statusCode: 200,
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(response),
  }
}
