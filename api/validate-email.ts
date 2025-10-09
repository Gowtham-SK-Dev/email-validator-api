import { Router, Request, Response } from "express";
import { validateSyntax } from "../src/utils/validateSyntax";
import { validateMx } from "../src/utils/validateMx";
import { validateSmtp } from "../src/utils/validateSmtp";
import { isDisposableDomain } from "../src/utils/isDisposableDomain";
import { isRoleEmail } from "../src/utils/isRoleEmail";

interface ValidationResult {
  passed: boolean;
  message: string;
  records?: any[];
  confidence?: number;
  inboxValidation?: any;
}

interface EmailValidationResponse {
  email: string;
  valid: boolean;
  results: {
    syntax: ValidationResult;
    mx: ValidationResult;
    smtp: ValidationResult;
    disposableDomain: ValidationResult;
    roleBased: ValidationResult;
  };
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const responseCache = new Map<string, { timestamp: number; value: EmailValidationResponse }>();

export const router: Router = Router();

router.post("/validate-email", async (req: Request, res: Response) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { email, checkInbox: checkInboxLegacy = true, tests } = req.body || {};

    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required and must be a string" });
    }

    const enableSmtp = typeof tests?.smtp === "boolean" ? tests.smtp : checkInboxLegacy;
    const enableMx = typeof tests?.mx === "boolean" ? tests.mx : true;
    const enableDisposable = typeof tests?.disposableDomain === "boolean" ? tests.disposableDomain : true;
    const enableRole = typeof tests?.roleBased === "boolean" ? tests.roleBased : true;

    const cacheKey = `${email}|smtp:${enableSmtp ? 1 : 0}|mx:${enableMx ? 1 : 0}|disp:${enableDisposable ? 1 : 0}|role:${enableRole ? 1 : 0}`;
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json(cached.value);
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
    };

    // 1) Syntax check
    const syntaxResult = validateSyntax(email);
    response.results.syntax = syntaxResult;
    if (!syntaxResult.passed) {
      responseCache.set(cacheKey, { timestamp: Date.now(), value: response });
      return res.json(response);
    }

    const domain = email.split("@")[1]?.toLowerCase();
    const isGmail = domain === "gmail.com";

    // 2) Role-based
    if (enableRole) {
      if (isGmail) {
        response.results.roleBased = { passed: true, message: "Gmail addresses are not checked for role-based patterns" };
      } else {
        const roleResult = isRoleEmail(email);
        response.results.roleBased = roleResult;
        if (!roleResult.passed) {
          responseCache.set(cacheKey, { timestamp: Date.now(), value: response });
          return res.json(response);
        }
      }
    }

    // 3) Disposable & MX
    if (isGmail) {
      if (enableDisposable) response.results.disposableDomain = { passed: true, message: "Gmail is not a disposable domain" };
      if (enableMx) response.results.mx = { passed: true, message: "Gmail has valid MX records" };
    } else {
      if (enableDisposable) response.results.disposableDomain = await isDisposableDomain(email);
      if (enableMx) response.results.mx = await validateMx(email);

      if ((enableDisposable && !response.results.disposableDomain.passed) || (enableMx && !response.results.mx.passed)) {
        responseCache.set(cacheKey, { timestamp: Date.now(), value: response });
        return res.json(response);
      }
    }

    // 4) SMTP
    if (enableSmtp) {
      response.results.smtp = await validateSmtp(email);
    }

    // 5) Compute final validity
    response.valid =
      response.results.syntax.passed &&
      (!enableRole || response.results.roleBased.passed) &&
      (!enableDisposable || response.results.disposableDomain.passed) &&
      (!enableMx || response.results.mx.passed) &&
      (!enableSmtp || response.results.smtp.passed);

    responseCache.set(cacheKey, { timestamp: Date.now(), value: response });
    return res.json(response);
  } catch (err: unknown) {
    console.error("Validation error:", err);
    return res.status(500).json({
      error: "Internal server error during validation",
      message: err instanceof Error ? err.message : String(err),
    });
  }
});
