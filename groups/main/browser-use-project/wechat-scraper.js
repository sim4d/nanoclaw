/**
 * WeChat Article Scraper
 * Scrapes WeChat articles with full content rendering
 */

const { BrowserAgent } = require('./browser-agent.js');

async function scrapeWeChatArticle(url) {
  const agent = new BrowserAgent();

  try {
    console.log('🚀 Starting WeChat article scraper...');
    await agent.init();

    console.log('📱 Navigating to WeChat article...');
    await agent.goto(url);

    // Wait for content to load
    console.log('⏳ Waiting for content to load...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get article title
    const title = await agent.page.evaluate(() => {
      const titleEl = document.querySelector('.rich_media_title') ||
                     document.querySelector('title') ||
                     document.querySelector('h1');
      return titleEl ? titleEl.textContent.trim() : 'No title found';
    });

    // Get article content
    const content = await agent.page.evaluate(() => {
      const contentEl = document.querySelector('.rich_media_content') ||
                       document.querySelector('#js_content') ||
                       document.querySelector('article');
      return contentEl ? contentEl.textContent.slice(0, 500) : 'No content found';
    });

    // Get author info
    const author = await agent.page.evaluate(() => {
      const authorEl = document.querySelector('.rich_media_meta_text') ||
                      document.querySelector('#js_toobar3');
      return authorEl ? authorEl.textContent.trim() : 'Unknown author';
    });

    console.log('📸 Taking full page screenshot...');
    const screenshotPath = `wechat-article-${Date.now()}.png`;
    await agent.screenshot(screenshotPath);

    console.log('\n📰 Article Info:');
    console.log('━'.repeat(50));
    console.log(`📌 Title: ${title}`);
    console.log(`✍️  Author: ${author}`);
    console.log(`📄 Content preview: ${content.substring(0, 100)}...`);
    console.log(`📸 Screenshot: ${screenshotPath}`);
    console.log('━'.repeat(50));

    return {
      title,
      author,
      content: content.substring(0, 1000),
      screenshot: screenshotPath,
      url
    };

  } catch (error) {
    console.error('❌ Error scraping WeChat article:', error.message);
    throw error;
  } finally {
    await agent.close();
  }
}

// Run if called directly
if (require.main === module) {
  const url = process.argv[2] || 'https://mp.weixin.qq.com/s/ZkcoudONme61SI5s5QaYAg';

  (async () => {
    try {
      const result = await scrapeWeChatArticle(url);
      console.log('\n✅ Scraping completed successfully!');
    } catch (error) {
      console.error('\n❌ Scraping failed:', error.message);
    }
  })();
}

module.exports = { scrapeWeChatArticle };
