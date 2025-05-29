// Make sure to install puppeteer: npm install puppeteer
import puppeteer from "puppeteer"
import { findChromeExecutable } from "./puppeteer-setup"

export async function testGoogleSignin(email: string): Promise<{ status: string; message: string }> {
  console.log(`🔐 Starting Google sign-in test for: ${email}`)

  let browser
  try {
    // Try to find system Chrome if Puppeteer can't find its own
    const chromePath = findChromeExecutable()
    const launchOptions: any = {
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    }
    if (chromePath) {
      launchOptions.executablePath = chromePath
    }

    browser = await puppeteer.launch(launchOptions)
    const page = await browser.newPage()
    await page.goto(
      "https://accounts.google.com/v3/signin/identifier?authuser=0&continue=https%3A%2F%2Fmyaccount.google.com%2F&ec=GAlAwAE&hl=en&service=accountsettings&flowName=GlifWebSignIn&flowEntry=AddSession",
      { waitUntil: "domcontentloaded", timeout: 20000 },
    )

    await page.waitForSelector('input[type="email"]', { timeout: 10000 })
    await page.evaluate(() => {
      const input = document.querySelector('input[type="email"]') as HTMLInputElement
      if (input) input.value = ""
    })
    await page.type('input[type="email"]', email, { delay: 30 })

    await page.waitForSelector("#identifierNext button, button[jsname='LgbsSe']", { timeout: 5000 })
    await page.click("#identifierNext button, button[jsname='LgbsSe']")

    await page.waitForTimeout(2500)

    const error = await page.$eval('div[jsname="B34EJ"]', (el) => el.textContent).catch(() => null)
    if (error && error.trim()) {
      await browser.close()
      return { status: "error", message: error.trim() }
    }

    const passwordInput = await page.$('input[type="password"]')
    await browser.close()
    if (passwordInput) {
      return { status: "success", message: "Email is valid (password step reached, no error after Next)." }
    }

    return { status: "unknown", message: "Could not determine result (no error or password field found)." }
  } catch (err: any) {
    if (browser) await browser.close()
    // Distinguish Chrome not found error
    if (
      err &&
      typeof err.message === "string" &&
      err.message.includes("Could not find Chrome")
    ) {
      return {
        status: "chrome_not_found",
        message:
          "Chrome browser not found for Puppeteer. Please install Chrome or run `npx puppeteer browsers install chrome`.",
      }
    }
    return { status: "technical_error", message: "Puppeteer error: " + err.message }
  }
}

// Enhanced version with retry logic
export async function testGoogleSigninWithRetry(
  email: string,
  maxRetries = 2,
): Promise<{ status: string; message: string }> {
  console.log(`🔐 Starting Google sign-in test with retry for: ${email} (max retries: ${maxRetries})`)

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`🔐 Attempt ${attempt}/${maxRetries} for email: ${email}`)

    try {
      const result = await testGoogleSignin(email)
      console.log(`🔐 Attempt ${attempt} result:`, result)

      // If we get a definitive result (success or error), return it
      if (result.status === "success" || result.status === "error") {
        console.log(`🔐 Definitive result on attempt ${attempt}: ${result.status}`)
        return result
      }

      // If technical error and we have retries left, try again
      if (result.status === "technical_error" && attempt < maxRetries) {
        console.log(`🔐 Technical error on attempt ${attempt}, retrying in 3 seconds...`)
        await new Promise((resolve) => setTimeout(resolve, 3000))
        continue
      }

      // Return the result if it's the last attempt
      return result
    } catch (error) {
      console.error(`🔐 Attempt ${attempt} failed with error:`, error)

      if (attempt < maxRetries) {
        console.log(`🔐 Retrying after error in 3 seconds...`)
        await new Promise((resolve) => setTimeout(resolve, 3000))
        continue
      }

      return {
        status: "technical_error",
        message: `All attempts failed. Last error: ${error instanceof Error ? error.message : "Unknown error"}`,
      }
    }
  }

  return { status: "technical_error", message: "Max retries exceeded" }
}

// Alternative Gmail validation (simplified - only for format checking)
async function alternativeGmailValidation(email: string): Promise<{ status: string; message: string }> {
  console.log(`🔄 Using alternative Gmail validation for: ${email}`)

  if (!email.endsWith("@gmail.com")) {
    return {
      status: "error",
      message: "Not a Gmail address",
    }
  }

  const localPart = email.split("@")[0]

  // Basic Gmail format validation
  if (localPart.length < 6 || localPart.length > 30) {
    return {
      status: "error",
      message: "Gmail addresses must be between 6-30 characters",
    }
  }

  if (!/^[a-z0-9._]+$/i.test(localPart)) {
    return {
      status: "error",
      message: "Gmail addresses can only contain letters, numbers, dots, and underscores",
    }
  }

  if (localPart.includes("..") || localPart.startsWith(".") || localPart.endsWith(".")) {
    return {
      status: "error",
      message: "Invalid dot placement in Gmail address",
    }
  }

  // If format is valid but we can't verify existence
  return {
    status: "unknown",
    message: "Gmail format is valid but existence could not be verified",
  }
}
