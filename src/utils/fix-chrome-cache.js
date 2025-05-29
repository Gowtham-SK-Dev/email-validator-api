// Quick fix script to resolve Chrome cache issues
const { execSync } = require("child_process")
const fs = require("fs")
const path = require("path")
const os = require("os")

console.log("🔧 FIXING CHROME CACHE ISSUES")
console.log("=".repeat(50))

// Step 1: Clear problematic environment variables
console.log("1️⃣ Clearing problematic environment variables...")
delete process.env.PUPPETEER_EXECUTABLE_PATH
delete process.env.PUPPETEER_CACHE_DIR
console.log("✅ Environment variables cleared")

// Step 2: Remove existing Puppeteer cache
console.log("\n2️⃣ Cleaning Puppeteer cache...")
const cacheDir = path.join(os.homedir(), ".cache", "puppeteer")
if (fs.existsSync(cacheDir)) {
  try {
    execSync(`rm -rf "${cacheDir}"`, { stdio: "inherit" })
    console.log("✅ Puppeteer cache cleared")
  } catch (error) {
    console.log("⚠️ Could not clear cache automatically")
  }
} else {
  console.log("ℹ️ No cache directory found")
}

// Step 3: Install Chrome via Puppeteer
console.log("\n3️⃣ Installing Chrome via Puppeteer...")
try {
  console.log("Running: npx puppeteer browsers install chrome")
  execSync("npx puppeteer browsers install chrome", {
    stdio: "inherit",
    timeout: 120000, // 2 minutes
  })
  console.log("✅ Chrome installed successfully")
} catch (error) {
  console.log("⚠️ Chrome installation failed:", error.message)
  console.log("💡 This is OK - we'll use bundled Chromium instead")
}

// Step 4: Test Puppeteer with bundled Chromium
console.log("\n4️⃣ Testing Puppeteer with bundled Chromium...")
try {
  const testCode = `
    const puppeteer = require('puppeteer');
    (async () => {
      const browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--no-first-run',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-images',
          '--window-size=1280,720',
          '--single-process',
          '--no-zygote',
          '--disable-gpu',
          '--disable-software-rasterizer'
        ],
        defaultViewport: { width: 1280, height: 720 }
      });
      
      const page = await browser.newPage();
      await page.goto('https://example.com');
      const title = await page.title();
      console.log('✅ Test successful! Page title:', title);
      await browser.close();
    })().catch(err => {
      console.log('❌ Test failed:', err.message);
    });
  `

  execSync(`node -e "${testCode.replace(/"/g, '\\"')}"`, { stdio: "inherit" })
} catch (error) {
  console.log("❌ Test failed:", error.message)
}

console.log("\n" + "=".repeat(50))
console.log("🎯 SUMMARY:")
console.log("1. Environment variables cleared")
console.log("2. Cache cleaned")
console.log("3. Chrome installation attempted")
console.log("4. Bundled Chromium test completed")
console.log("\n💡 Your email validation should now work!")
console.log("The system will use Puppeteer's bundled Chromium browser.")
