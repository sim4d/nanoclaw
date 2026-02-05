/**
 * Simple Screenshot Tool using Playwright
 */

const { chromium } = require('playwright');

async function takeScreenshot(url, filename = 'screenshot.png') {
  console.log('🚀 Starting browser...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  console.log(`🌐 Navigating to: ${url}`);
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

  // Wait for content to load
  console.log('⏳ Waiting for content to load...');
  await page.waitForTimeout(3000);

  // Get page info
  const title = await page.title();
  console.log(`📄 Page title: ${title}`);

  // Take screenshot
  const outputPath = `/workspace/group/browser-use-project/${filename}`;
  console.log(`📸 Taking screenshot: ${outputPath}`);
  await page.screenshot({
    path: outputPath,
    fullPage: true
  });

  console.log('✅ Screenshot saved!');
  await browser.close();

  return {
    title,
    path: outputPath,
    url
  };
}

// Run if called directly
if (require.main === module) {
  const url = process.argv[2] || 'https://mp.weixin.qq.com/s/ZkcoudONme61SI5s5QaYAg';
  const filename = process.argv[3] || `wechat-${Date.now()}.png`;

  (async () => {
    try {
      const result = await takeScreenshot(url, filename);
      console.log('\n📊 Result:');
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  })();
}

module.exports = { takeScreenshot };
