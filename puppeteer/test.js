// npm i puppeteer puppeteer-har tcp-ping
const puppeteer = require('puppeteer');
const PuppeteerHar = require('puppeteer-har');
const fs = require('fs').promises;
const tcpp = require('tcp-ping');
const util = require('util');
const qs = require('qs');

const getData = async (url, timeout) => {
  const browser = await puppeteer.launch();
  const context = await browser.createIncognitoBrowserContext();
  const page = await context.newPage();
  const data = {};

  const recording = new PuppeteerHar(page);
  await recording.start();

  await page.goto(url);
  await page.waitFor(timeout);

  data.har = await recording.stop();
  //await fs.writeFile("har.json", JSON.stringify(data.har), "utf8")

  data.cookies = await page._client.send('Network.getAllCookies')
  //await fs.writeFile("cookies.json", JSON.stringify(data.cookies), "utf8")

  data.localStorage = await page.evaluate(() => Object.assign({}, window.localStorage))
  //await fs.writeFile("localStorage.json", JSON.stringify(data.localStorage), "utf8")

  data.sessionStorage = await page.evaluate(() => Object.assign({}, window.sessionStorage))
  //await fs.writeFile("sessionStorage.json", JSON.stringify(data.sessionStorage), "utf8")

  data.indexedDB = await page.evaluate(async () => {
    const result = {};
    const databases = await window.indexedDB.databases();

    const connect = (database) => new Promise(function (resolve, _) {
      const request = window.indexedDB.open(database.name, database.version);
      request.onsuccess = _ => resolve(request.result);
    });

    const getAll = (db, objectStoreName) => new Promise(function (resolve, _) {
      const request = db.transaction([objectStoreName]).objectStore(objectStoreName).getAll();
      request.onsuccess = _ => resolve(request.result);
    });

    for (i = 0; i < databases.length; i++) {
      const db = await connect(databases[i])
      const dbName = db.name;
      result[dbName] = {}
      for (j = 0; j < db.objectStoreNames.length; j++) {
        const objectStoreName = db.objectStoreNames[j];
        result[dbName][objectStoreName] = []
        const values = await getAll(db, objectStoreName);
        result[dbName][objectStoreName] = values;
      }

    }
    return result;
  });
  //await fs.writeFile("indexedDB.json", JSON.stringify(data.indexedDB), "utf8")
  await browser.close();

  return data;
};

const sortUnique = (a) => a.sort().filter(function (elem, index, arr) {
  return index == arr.length - 1 || arr[index + 1] != elem
});

const getFlags = (entries) => {

  // get all domains
  const domains = sortUnique(entries.map(e => new URL(e.request.url).host));

  // initialize flags
  //const flags = Object.fromEntries(domains.map(domain => [domain, {}]))
  const flags = domains.reduce((flags, domain) => { flags[domain] = {}; return flags; }, {});

  // set no_ssl 
  const noSslEntries = entries.filter(e => new URL(e.request.url).protocol == 'http:');
  const noSslDomains = sortUnique(noSslEntries.map(e => new URL(e.request.url).host));
  noSslDomains.forEach(domain => flags[domain]['no_ssl'] = true);

  // google analytics ga_aip flag
  const gaDomain = 'www.google-analytics.com';
  const gaEntries = entries.filter(e => {
    const u = new URL(e.request.url);
    return (u.host == gaDomain) && (u.pathname.indexOf('/collect') != -1)
  });
  gaEntries.forEach((e) => {
    const get = e.request.queryString.reduce((get, pair) => { get[pair.name] = pair.value; return get; }, {});
    const post = e.request.postData ? qs.parse(e.request.postData.text) : {};
    const aip = get['aip'] || post['aip'];
    flags[gaDomain][aip ? 'ga_aip' : 'ga_no_aip'] = true;
  });

  // set domain flags
  const domainFlags = {
    'fonts.googleapis.com': 'g_fonts',
    'stats.g.doubleclick.net': 'g_dc_ads',
    'connect.facebook.net': 'fb_connect',
    'ping.chartbeat.net': 'chartbeat',
    'bam.nr-data.net': 'nr_in_us'
  }
  Object.keys(flags).forEach((domain) => {
    if (domain in domainFlags) {
      const flag = domainFlags[domain];
      flags[domain][flag] = true;
    }
  });

  return flags;
}

(async () => {
  data = await getData('https://www.nu.nl', 2000);
  const entries = data.har.log.entries.filter(e => e.request.url);
  flags = getFlags(entries);

  const ping = util.promisify(tcpp.ping);
  const result = await ping({
    address: '94.130.129.123', port: 443,
    attempts: 1
  });
  console.log(flags);
})()
