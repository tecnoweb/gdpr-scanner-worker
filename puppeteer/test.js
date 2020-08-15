const puppeteer = require('puppeteer');
const PuppeteerHar = require('puppeteer-har');
const fs = require("fs").promises;

(async () => {
  const browser = await puppeteer.launch()
  const context = await browser.createIncognitoBrowserContext();
  const page = await context.newPage()

  const har = new PuppeteerHar(page);
  await har.start({ path: 'har.json' })

  await page.goto('https://nu.nl/')
  await page.waitFor(2000);

  await har.stop();

  const cookies = await page._client.send('Network.getAllCookies')
  await fs.writeFile("cookies.json", JSON.stringify(cookies), "utf8")

  const databases = await page.evaluate(async () => await window.indexedDB.databases())
  await fs.writeFile("indexedDB.json", JSON.stringify(databases), "utf8")

  var conn = indexedDB.open('some-db', 1) // change the name and version as needed
  connection.onsuccess = e => {
    var database = e.target.result
    exportToJson(database).then(console.log).catch(console.error)
  }

  const localStorage = await page.evaluate(() => Object.assign({}, window.localStorage))
  await fs.writeFile("localStorage.json", JSON.stringify(localStorage), "utf8")

  const sessionStorage = await page.evaluate(() => Object.assign({}, window.sessionStorage))
  await fs.writeFile("sessionStorage.json", JSON.stringify(sessionStorage), "utf8")

  await browser.close()
})()
