import express, { Request, Response } from "express";
import { validateSyntax } from "../utils/validateSyntax";
import { validateMx } from "../utils/validateMx";
import { validateSmtp } from "../utils/validateSmtp";
import { isDisposableDomain } from "../utils/isDisposableDomain";
import { isRoleEmail } from "../utils/isRoleEmail";

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

const CACHE_TTL = 5 * 60 * 1000;
const responseCache = new Map<string, { timestamp: number; value: EmailValidationResponse }>();

const router = express.Router();

router.post("/validate-email", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, checkInbox: checkInboxLegacy = true, tests } = req.body || {};

    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "Email is required and must be a string" });
      return;
    }

    const enableSmtp = typeof tests?.smtp === "boolean" ? tests.smtp : checkInboxLegacy;
    const enableMx = typeof tests?.mx === "boolean" ? tests.mx : true;
    const enableDisposable = typeof tests?.disposableDomain === "boolean" ? tests.disposableDomain : true;
    const enableRole = typeof tests?.roleBased === "boolean" ? tests.roleBased : true;

    const cacheKey = `${email}|smtp:${enableSmtp ? 1 : 0}|mx:${enableMx ? 1 : 0}|disp:${enableDisposable ? 1 : 0}|role:${enableRole ? 1 : 0}`;
    const cached = responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      res.json(cached.value);
      return;
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

    // 1️⃣ Syntax
    const syntaxResult = validateSyntax(email);
    response.results.syntax = syntaxResult;
    if (!syntaxResult.passed) {
      responseCache.set(cacheKey, { timestamp: Date.now(), value: response });
      res.json(response);
      return;
    }

    const domain = email.split("@")[1]?.toLowerCase();
    const isGmail = domain === "gmail.com";

    // 2️⃣ Role-based
    if (enableRole) {
      if (isGmail) {
        response.results.roleBased = { passed: true, message: "Gmail addresses are not checked for role-based patterns" };
      } else {
        const roleResult = isRoleEmail(email);
        response.results.roleBased = roleResult;
        if (!roleResult.passed) {
          responseCache.set(cacheKey, { timestamp: Date.now(), value: response });
          res.json(response);
          return;
        }
      }
    }

    // 3️⃣ Disposable + 4️⃣ MX
    const promises: Array<Promise<void>> = [];

    if (!isGmail) {
      if (enableDisposable) {
        promises.push(
          isDisposableDomain(email).then(result => {
            response.results.disposableDomain = result;
          })
        );
      }

      if (enableMx) {
        promises.push(
          validateMx(email).then(result => {
            response.results.mx = result;
          })
        );
      }
    } else {
      if (enableDisposable) response.results.disposableDomain = { passed: true, message: "Gmail is not a disposable domain" };
      if (enableMx) response.results.mx = { passed: true, message: "Gmail has valid MX records" };
    }

    if (promises.length) await Promise.all(promises);

    if (
      (enableDisposable && !response.results.disposableDomain.passed) ||
      (enableMx && !response.results.mx.passed)
    ) {
      responseCache.set(cacheKey, { timestamp: Date.now(), value: response });
      res.json(response);
      return;
    }

    // 5️⃣ SMTP
    if (enableSmtp) {
      const smtpResult = await validateSmtp(email);
      response.results.smtp = smtpResult;
    }

    response.valid =
      response.results.syntax.passed &&
      (!enableRole || response.results.roleBased.passed) &&
      (!enableDisposable || response.results.disposableDomain.passed) &&
      (!enableMx || response.results.mx.passed) &&
      (!enableSmtp || response.results.smtp.passed);

    responseCache.set(cacheKey, { timestamp: Date.now(), value: response });
    res.json(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Validation error:", message);
    res.status(500).json({ error: "Internal server error during validation", message });
  }
});

export default router;
