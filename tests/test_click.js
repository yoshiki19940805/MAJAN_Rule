const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('Browser log:', msg.text()));
    page.on('pageerror', err => console.error('Browser error:', err));
    
    await page.goto('file://' + __dirname + '/index.html');
    await page.waitForTimeout(1000);
    
    // ルールを一つ作成して保存する
    await page.evaluate(() => {
        window.createRule('四麻');
        document.getElementById('edit-name').value = 'Test Rule';
        window.saveAndGoHome();
    });
    
    await page.waitForTimeout(500);
    
    // ルールカードをクリック
    console.log("Clicking the first rule card...");
    await page.evaluate(() => {
        // カードの要素(bg-theme-surface)を取得
        const card = document.querySelector('div.bg-theme-surface.p-4.rounded-2xl');
        if (card) {
            console.log("Card found! Inner HTML:", card.innerHTML.substring(0, 100));
            card.click();
        } else {
            console.log("Card not found");
        }
    });
    
    await page.waitForTimeout(500);
    
    // 編集画面が開いているか確認
    const isEditScreenVisible = await page.evaluate(() => {
        return document.getElementById('screen-edit').classList.contains('active');
    });
    
    console.log("Is edit screen visible?", isEditScreenVisible);
    
    await browser.close();
})();
