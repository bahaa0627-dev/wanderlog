import puppeteer from 'puppeteer-core';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function debugMovieHTML() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();
  
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

    // Get the first plot item HTML
    const html = await page.evaluate(() => {
      const firstPlot = document.querySelector('.movie-plot ul li');
      return firstPlot ? firstPlot.outerHTML : 'No plot items found';
    });

    console.log('First plot item HTML:');
    console.log(html);

  } finally {
    await browser.close();
  }
}

debugMovieHTML().catch(console.error);
