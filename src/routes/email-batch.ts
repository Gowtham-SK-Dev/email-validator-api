import express, { Request, Response } from "express";
import { testGoogleSigninBatch } from "../utils/googleSigninTest";
import { validateSyntax } from "../utils/validateSyntax";
import { performanceMonitor } from "../utils/performance-monitor";

interface BatchResult {
  email: string;
  valid: boolean;
  message?: string;
  status?: string;
  error?: string;
}

const router = express.Router();

router.post("/validate-emails-batch", async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();

  try {
    const { emails } = req.body;

    if (!emails || !Array.isArray(emails)) {
      res.status(400).json({ error: "Emails array is required" });
      return;
    }

    if (emails.length > 50) {
      res.status(400).json({ error: "Maximum 50 emails allowed per batch" });
      return;
    }

    const validEmails: string[] = [];
    const results: BatchResult[] = [];

    for (const email of emails) {
      if (typeof email !== "string") {
        results.push({ email, valid: false, error: "Email must be a string" });
        continue;
      }

      const syntaxResult = validateSyntax(email);
      if (!syntaxResult.passed) {
        results.push({ email, valid: false, error: syntaxResult.message });
        continue;
      }

      validEmails.push(email);
    }

    const gmailEmails = validEmails.filter(email => email.endsWith("@gmail.com"));
    const otherEmails = validEmails.filter(email => !email.endsWith("@gmail.com"));

    if (gmailEmails.length > 0) {
      console.log(`📧 Processing ${gmailEmails.length} Gmail addresses in batch`);
      const gmailResults = await testGoogleSigninBatch(gmailEmails);

      for (const email of gmailEmails) {
        const result = gmailResults.get(email);
        results.push({
          email,
          valid: result?.status === "success",
          message: result?.message || "Unknown result",
          status: result?.status || "unknown",
        });
      }
    }

    for (const email of otherEmails) {
      results.push({
        email,
        valid: true,
        message: "Syntax validation passed",
        status: "syntax_only",
      });
    }

    const totalTime = Date.now() - startTime;
    const successCount = results.filter(r => r.valid).length;

    performanceMonitor.recordValidation(totalTime, true);

    res.json({
      totalEmails: emails.length,
      validEmails: successCount,
      invalidEmails: emails.length - successCount,
      processingTime: totalTime,
      results,
    });
  } catch (err: unknown) {
    const totalTime = Date.now() - startTime;
    performanceMonitor.recordValidation(totalTime, false);

    const message = err instanceof Error ? err.message : String(err);
    console.error("Batch validation error:", message);

    res.status(500).json({
      error: "Internal server error during batch validation",
      message,
    });
  }
});

router.get("/performance-metrics", (_req: Request, res: Response): void => {
  const metrics = performanceMonitor.getDetailedStats();
  res.json(metrics);
});

export default router;
