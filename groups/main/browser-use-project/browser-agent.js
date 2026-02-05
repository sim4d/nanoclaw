/**
 * Browser-Use Agent - Simple Node.js Implementation
 * A basic browser automation agent using Puppeteer
 */

const puppeteer = require('puppeteer');

class BrowserAgent {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  /**
   * Initialize the browser
   */
  async init() {
    console.log('🚀 Initializing browser...');
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });
    this.page = await this.browser.newPage();
    console.log('✅ Browser initialized successfully');
  }

  /**
   * Navigate to a URL
   */
  async goto(url) {
    if (!this.page) await this.init();
    console.log(`🌐 Navigating to: ${url}`);
    await this.page.goto(url, { waitUntil: 'networkidle2' });
    console.log('✅ Page loaded');
    return this.page;
  }

  /**
   * Take a screenshot
   */
  async screenshot(filename = 'screenshot.png') {
    if (!this.page) throw new Error('Browser not initialized');
    const path = `/workspace/group/browser-use-project/${filename}`;
    await this.page.screenshot({ path, fullPage: true });
    console.log(`📸 Screenshot saved: ${path}`);
    return path;
  }

  /**
   * Get page title
   */
  async getTitle() {
    if (!this.page) throw new Error('Browser not initialized');
    const title = await this.page.title();
    console.log(`📄 Page title: ${title}`);
    return title;
  }

  /**
   * Get page text content
   */
  async getContent() {
    if (!this.page) throw new Error('Browser not initialized');
    const content = await this.page.evaluate(() => {
      return document.body.innerText;
    });
    return content;
  }

  /**
   * Click an element by selector
   */
  async click(selector) {
    if (!this.page) throw new Error('Browser not initialized');
    console.log(`🖱️  Clicking: ${selector}`);
    await this.page.click(selector);
    console.log('✅ Clicked');
  }

  /**
   * Type text into an input
   */
  async type(selector, text) {
    if (!this.page) throw new Error('Browser not initialized');
    console.log(`⌨️  Typing into ${selector}: ${text}`);
    await this.page.type(selector, text);
    console.log('✅ Text entered');
  }

  /**
   * Wait for a selector
   */
  async waitForSelector(selector, timeout = 5000) {
    if (!this.page) throw new Error('Browser not initialized');
    console.log(`⏳ Waiting for: ${selector}`);
    await this.page.waitForSelector(selector, { timeout });
    console.log('✅ Element found');
  }

  /**
   * Extract all links from the page
   */
  async getLinks() {
    if (!this.page) throw new Error('Browser not initialized');
    const links = await this.page.evaluate(() => {
      return Array.from(document.querySelectorAll('a'))
        .map(a => ({
          text: a.textContent.trim(),
          href: a.href
        }))
        .filter(link => link.href && link.text);
    });
    console.log(`🔗 Found ${links.length} links`);
    return links;
  }

  /**
   * Execute custom JavaScript
   */
  async evaluate(script) {
    if (!this.page) throw new Error('Browser not initialized');
    return await this.page.evaluate(script);
  }

  /**
   * Close the browser
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('👋 Browser closed');
      this.browser = null;
      this.page = null;
    }
  }
}

/**
 * Example usage functions
 */
async function example1_basicNavigation() {
  const agent = new BrowserAgent();
  try {
    await agent.init();
    await agent.goto('https://example.com');
    const title = await agent.getTitle();
    await agent.screenshot('example.png');
    return title;
  } finally {
    await agent.close();
  }
}

async function example2_searchAndExtract() {
  const agent = new BrowserAgent();
  try {
    await agent.init();
    await agent.goto('https://www.google.com');
    await agent.type('textarea[name="q"]', 'browser automation');
    await agent.screenshot('search.png');
    return 'Search completed';
  } finally {
    await agent.close();
  }
}

async function example3_extractLinks() {
  const agent = new BrowserAgent();
  try {
    await agent.init();
    await agent.goto('https://news.ycombinator.com');
    const links = await agent.getLinks();
    console.log(`Top 5 links:`);
    links.slice(0, 5).forEach((link, i) => {
      console.log(`${i + 1}. ${link.text} - ${link.href}`);
    });
    return links;
  } finally {
    await agent.close();
  }
}

// Export for use as a module
module.exports = { BrowserAgent, example1_basicNavigation, example2_searchAndExtract, example3_extractLinks };

// Run examples if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const example = args[0] || '1';

  (async () => {
    try {
      switch (example) {
        case '1':
          await example1_basicNavigation();
          break;
        case '2':
          await example2_searchAndExtract();
          break;
        case '3':
          await example3_extractLinks();
          break;
        default:
          console.log('Usage: node browser-agent.js [1|2|3]');
          console.log('  1 - Basic navigation');
          console.log('  2 - Search and extract');
          console.log('  3 - Extract links from Hacker News');
      }
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  })();
}
