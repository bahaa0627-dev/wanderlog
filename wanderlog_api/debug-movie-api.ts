import puppeteer from 'puppeteer-core';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function debugMovieAPI() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();
  
  // Listen to network requests
  const apiCalls: any[] = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/')) {
      try {
        const data = await response.json();
        apiCalls.push({ url, data });
      } catch (e) {
        // Not JSON
      }
    }
  });
  
  try {
    await page.goto('https://prd.mocation.cc/html/movie_detail.html?id=5448', {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    await page.waitForFunction(() => {
      const loading = document.getElementById('loading');
      if (loading && loading.style.display !== 'none') return false;
      return true;
    }, { timeout: 15000 }).catch(() => {});

    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('API Calls found:');
    apiCalls.forEach((call, i) => {
      console.log(`\n${i + 1}. ${call.url}`);
      if (call.data && call.data.data && call.data.data.plots) {
        console.log('   Plots data found!');
        console.log('   First plot:', JSON.stringify(call.data.data.plots[0], null, 2));
      }
    });

  } finally {
    await browser.close();
  }
}

debugMovieAPI().catch(console.error);
