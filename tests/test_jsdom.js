const jsdom = require("jsdom");
const fs = require("fs");
const { JSDOM } = jsdom;
const html = fs.readFileSync("index.html", "utf8");

const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable" });
const window = dom.window;

window.onload = () => {
  const document = window.document;
  window.editingId = "rule_test";
  window.isSharedMode = true; 
  window.rules = [
    { id: "rule_test", name: "Test Rule", mode: "三麻", settings: window.DEFAULT_3 }
  ];
  window.baseRuleObj = null;

  window.renderEdit();
  
  const items = document.querySelectorAll(".swipe-item");
  for (let item of items) {
    const label = item.querySelector(".item-label");
    if (!label) continue;
    const text = label.textContent.trim();
    if (text === "誤鳴き（発声のみ）" || text === "リーチ取消" || text === "少牌") {
      const isLastChild = item === item.parentElement.lastElementChild;
      const nextSiblingText = item.nextElementSibling ? item.nextElementSibling.querySelector(".item-label")?.textContent : null;
      console.log(text, {
        className: item.className,
        isLastChild: isLastChild,
        nextSibling: nextSiblingText
      });
    }
  }
};
