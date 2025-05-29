// STEP 1: Run this script to fix the Chrome issue
const fs = require("fs")
const path = require("path")
const os = require("os")

console.log("🔧 FIXING CHROME ISSUE - STEP BY STEP")
console.log("=".repeat(60))

// Step 1: Clear environment variables
console.log("1️⃣ Clearing problematic environment variables...")
delete process.env.PUPPETEER_EXECUTABLE_PATH
delete process.env.PUPPETEER_CACHE_DIR
console.log("✅ Environment variables cleared")

// Step 2: Remove cache directories
console.log("\n2️⃣ Removing Puppeteer cache directories...")
const cachePaths = [
  path.join(os.homedir(), ".cache", "puppeteer"),
  path.join(os.homedir(), ".cache", "ms-playwright"),
  path.join(process.cwd(), "node_modules", "puppeteer", ".local-chromium"),
]

for (const cachePath of cachePaths) {
  if (fs.existsSync(cachePath)) {
    try {
      fs.rmSync(cachePath, { recursive: true, force: true })
      console.log(`✅ Removed: ${cachePath}`)
    } catch (error) {
      console.log(`⚠️ Could not remove: ${cachePath}`)
    }
  } else {
    console.log(`ℹ️ Not found: ${cachePath}`)
  }
}

// Step 3: Test bundled Chromium
console.log("\n3️⃣ Testing bundled Chromium...")
testBundledChromium()

async function testBundledChromium() {
  try {
    const puppeteer = require("puppeteer")

    console.log("🚀 Launching browser with minimal config...")
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      // CRITICAL: No executablePath specified
    })

    console.log("✅ Browser launched successfully!")

    const page = await browser.newPage()
    await page.goto("https://example.com")
    const title = await page.title()

    console.log(`✅ Test page loaded: ${title}`)
    await browser.close()

    console.log("\n🎉 SUCCESS! Bundled Chromium is working!")
    console.log("✅ Your email validation should now work")
  } catch (error) {
    console.error("\n❌ Test failed:", error.message)
    console.log("\n🔧 Next steps:")
    console.log("1. Make sure puppeteer is installed: npm install puppeteer")
    console.log("2. Try the updated googleSigninTest.ts file")
  }
}
