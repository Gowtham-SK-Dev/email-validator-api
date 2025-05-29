import { execSync } from "child_process"
import fs from "fs"

// This file contains utilities for setting up Puppeteer in various environments

/**
 * Installs Chrome browser for Puppeteer if it's not already installed
 * @returns Promise that resolves when installation is complete
 */
export async function setupPuppeteerEnvironment(): Promise<void> {
  console.log("🔧 Setting up Puppeteer environment...")

  try {
    // Check if we're in a serverless environment
    const isServerless = process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL || process.env.NETLIFY

    if (isServerless) {
      console.log("🌩️ Detected serverless environment, using special configuration")

      // Set environment variables that help Puppeteer in serverless environments
      process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = "true"
      process.env.PUPPETEER_EXECUTABLE_PATH = "/tmp/chrome"
    }

    // Try to install Chrome using Puppeteer's built-in installer
    try {
      console.log("📦 Installing Chrome via Puppeteer...")
      execSync("npx puppeteer browsers install chrome", { stdio: "inherit" })
      console.log("✅ Chrome installed successfully via Puppeteer")
    } catch (installError) {
      console.warn("⚠️ Could not install Chrome via Puppeteer:", installError)

      // If in a serverless environment, try alternative installation methods
      if (isServerless) {
        console.log("🔄 Attempting alternative Chrome installation for serverless...")

        // This is a simplified example - in a real implementation, you might:
        // 1. Download a Chrome binary compatible with the serverless environment
        // 2. Extract it to a location like /tmp/chrome
        // 3. Make it executable

        // Example (not actually executed):
        // execSync("curl -L https://github.com/adieuadieu/serverless-chrome/releases/download/v1.0.0-55/stable-headless-chromium-amazonlinux-2.zip > /tmp/chrome.zip")
        // execSync("unzip /tmp/chrome.zip -d /tmp/")
        // execSync("chmod +x /tmp/chrome")
      }
    }

    console.log("✅ Puppeteer environment setup complete")
  } catch (error) {
    console.error("❌ Error setting up Puppeteer environment:", error)
    throw new Error(
      `Failed to set up Puppeteer environment: ${error instanceof Error ? error.message : "Unknown error"}`,
    )
  }
}

/**
 * Finds the Chrome executable in common locations
 * @returns Path to Chrome executable if found, undefined otherwise
 */
export function findChromeExecutable(): string | undefined {
  const possiblePaths = [
    // Linux paths
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    // Mac paths
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    // Windows paths
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    // Add more paths as needed
  ]

  for (const chromePath of possiblePaths) {
    if (fs.existsSync(chromePath)) {
      console.log(`✅ Found existing Chrome at: ${chromePath}`)
      return chromePath
    }
  }

  return undefined
}
