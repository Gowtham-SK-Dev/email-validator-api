// Make sure to install puppeteer: npm install puppeteer
import puppeteer from "puppeteer"

export async function testGoogleSignin(email: string): Promise<{ status: string; message: string }> {
  const browser = await puppeteer.launch({ headless: "new" })
  const page = await browser.newPage()
  try {
    await page.goto(
      "https://accounts.google.com/v3/signin/identifier?authuser=0&continue=https%3A%2F%2Fmyaccount.google.com%2F&ec=GAlAwAE&hl=en&service=accountsettings&flowName=GlifWebSignIn&flowEntry=AddSession",
      { waitUntil: "networkidle2" }
    )

    // Wait for the email input and type the email
    await page.waitForSelector('input[type="email"]', { timeout: 10000 })
    await page.type('input[type="email"]', email, { delay: 50 })

    // Click the Next button
    await page.click("#identifierNext button, button[jsname='LgbsSe']")

    // Wait for error message or navigation to password step
    await page.waitForTimeout(2000) // Wait for UI to update

    // Check for error message
    const error = await page.$eval('div[jsname="B34EJ"]', el => el.textContent).catch(() => null)
    await browser.close()
    if (error) {
      return { status: "error", message: error.trim() }
    } else {
      // No error means valid email (exists in Google)
      return { status: "success", message: "Email is valid (no error after Next)." }
    }
  } catch (err: any) {
    await browser.close()
    return { status: "fail", message: err.message }
  }
}
