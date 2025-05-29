import puppeteer from "puppeteer"

/**
 * FIXED VERSION - Forces bundled Chromium with minimal configuration
 */
export async function testGoogleSignin(email: string): Promise<{ status: string; message: string }> {
  console.log(`🔐 Testing email: ${email}`)

  let browser: puppeteer.Browser | null = null
  let page: puppeteer.Page | null = null

  try {
    // STEP 1: Force clear any Chrome-related environment variables
    delete process.env.PUPPETEER_EXECUTABLE_PATH
    delete process.env.PUPPETEER_CACHE_DIR
    delete process.env.CHROME_BIN
    delete process.env.CHROMIUM_PATH

    console.log("🚀 Launching with bundled Chromium...")

    // STEP 2: Launch with absolute minimal configuration
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      // CRITICAL: No executablePath - this forces bundled Chromium
    })

    console.log("✅ Browser launched successfully!")

    page = await browser.newPage()

    // STEP 3: Navigate to Google sign-in
    console.log("🌐 Going to Google sign-in...")
    await page.goto("https://accounts.google.com/signin/v2/identifier", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    })

    // STEP 4: Find and fill email input
    console.log("📝 Entering email...")
    await page.waitForSelector('input[type="email"]', { timeout: 10000 })
    await page.type('input[type="email"]', email)

    // STEP 5: Click Next button
    console.log("👆 Clicking Next...")
    await page.click("#identifierNext")

    // STEP 6: Wait and check result
    await page.waitForTimeout(3000)
    const url = page.url()

    // STEP 7: Analyze result
    if (url.includes("challenge") || url.includes("password")) {
      console.log("✅ Email exists!")
      return { status: "success", message: "Email exists" }
    } else if (url.includes("identifier")) {
      console.log("❌ Email rejected")
      return { status: "error", message: "Email not found" }
    } else {
      console.log("❓ Unclear result")
      return { status: "technical_error", message: "Could not determine result" }
    }
  } catch (error) {
    console.error("💥 Error:", error)
    return {
      status: "technical_error",
      message: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  } finally {
    // STEP 8: Always cleanup
    try {
      if (page) await page.close()
      if (browser) await browser.close()
    } catch (e) {
      console.warn("Cleanup error:", e)
    }
  }
}

export async function testGoogleSigninWithRetry(email: string, maxRetries = 2) {
  for (let i = 0; i < maxRetries; i++) {
    console.log(`🔄 Attempt ${i + 1}/${maxRetries}`)
    const result = await testGoogleSignin(email)

    if (result.status !== "technical_error") {
      return result
    }

    if (i < maxRetries - 1) {
      console.log("⏳ Waiting before retry...")
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }

  return { status: "technical_error", message: "All retries failed" }
}
