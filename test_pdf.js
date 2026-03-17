const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({headless: true});
  const page = await browser.newPage();
  
  // Go to local server
  await page.goto('http://localhost:8080', {waitUntil: 'networkidle0'});
  
  // Set up a download path to intercept downloads
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: __dirname + '/downloads'
  });

  // Wait for React to mount
  await page.waitForSelector('.screen.active');

  // Inject a function to simulate standard rule export
  await page.evaluate(async () => {
    // We can simulate clicking the custom rule to open edit
    // Wait, let's just create a dummy rule and call exportPDF
    window.editingId = 'dummy1';
    window.saveData = function(){};
    window.getRule = function() {
      return {
        id: 'dummy1',
        name: 'Test Rule',
        mode: '四麻',
        base_rule: 'standard',
        settings: {}
      };
    };
    window.BASE_RULES_4 = {
      'standard': { 'kuiten': 'あり' }
    };
    window.getCategories = function() {
      return [ [ '1. 基本ルール', ['kuiten'], false ] ];
    };

    // Override navigator.share to mock it
    navigator.share = undefined;

    // Call exportPDF
    await exportPDF();
  });

  console.log("exportPDF called. Waiting for downloads...");
  await page.waitForTimeout(3000); // wait for download
  
  const fs = require('fs');
  const files = fs.readdirSync(__dirname + '/downloads').filter(f => !f.startsWith('.'));
  console.log("Downloaded files:", files);

  await browser.close();
})();
