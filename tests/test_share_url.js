const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({headless: true});
  const page = await browser.newPage();
  
  // Go to local server
  await page.goto('http://localhost:8080/index.html?v=v72', {waitUntil: 'networkidle'});

  // Wait for React to mount
  await page.waitForSelector('.screen.active');

  // Inject a function to simulate standard rule export
  const shareUrl = await page.evaluate(async () => {
    window.editingId = 'dummy1';
    window.getRule = function() {
      return {
        id: 'dummy1',
        mode: '四麻',
        name: 'test',
        base_rule: 'standard',
        settings: {
          'foo': 'bar'
        }
      };
    };

    // Override clipboard to catch the URL
    let caughtUrl = '';
    navigator.clipboard = {
      writeText: async (text) => {
        caughtUrl = text;
        return Promise.resolve();
      }
    };
    
    // Call shareRule
    shareRule('dummy1');

    return caughtUrl;
  });

  console.log("Generated Share URL:", shareUrl);
  
  // Now try to open the URL
  const newPage = await browser.newPage();
  
  // We need to catch console errors
  newPage.on('console', msg => {
    if (msg.type() === 'error') {
       console.log('PAGE ERROR:', msg.text());
    }
  });
  
  newPage.on('pageerror', error => {
    console.log('PAGE EXCEPTION:', error.message);
  });
  
  // Try to override alert
  await newPage.evaluateInit(() => {
    window.alert = (msg) => console.log('ALERT:', msg);
  });

  await newPage.goto(shareUrl, {waitUntil: 'networkidle'});
  
  const h1 = await newPage.evaluate(() => {
    return document.querySelector('#edit-name') ? document.querySelector('#edit-name').value : 'Not found';
  });
  console.log("Loaded Rule Name:", h1);

  await browser.close();
})();
