// npm i puppeteer puppeteer-har tcp-ping
const puppeteer = require('puppeteer');
const PuppeteerHar = require('puppeteer-har');
const tcpp = require('tcp-ping');
const util = require('util');
const qs = require('qs');
const dns = require('dns');

const getBrowserData = async (url, timeout) => {
  const browser = await puppeteer.launch();
  const context = await browser.createIncognitoBrowserContext();
  const page = await context.newPage();
  const data = {};

  const recording = new PuppeteerHar(page);
  await recording.start();

  await page.goto(url);
  await page.waitFor(timeout);

  data.har = await recording.stop();

  data.cookies = await page._client.send('Network.getAllCookies')

  data.localStorage = await page.evaluate(() => Object.assign({}, window.localStorage))

  data.sessionStorage = await page.evaluate(() => Object.assign({}, window.sessionStorage))

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
  for (const domain of Object.keys(flags)) {
    if (domain in domainFlags) {
      const flag = domainFlags[domain];
      flags[domain][flag] = true;
    }
  }

  return flags;
}

const getDnsData = async (flags) => {

  const domains = Object.keys(flags);

  const nslookup = util.promisify(dns.lookup);
  const lookups = await Promise.all(domains.map((domain) => nslookup(domain)));
  const ips = domains.reduce((acc, domain, i) => (acc[domain] = lookups[i].address, acc), {})

  const rlookup = util.promisify(dns.reverse);
  const rlookups = await Promise.all(domains.map((domain) => rlookup(ips[domain]).catch(_ => [''])));
  const reverses = domains.reduce((acc, domain, i) => (acc[domain] = rlookups[i][0], acc), {})

  const ping = util.promisify(tcpp.ping);
  const times = {};
  for (var i = 0; i < 3; i++) {
    for (const domain of domains) {
      await new Promise(r => setTimeout(r, 100));
      const time = await ping({
        address: ips[domain], port: flags[domain]['no_ssl'] ? 80 : 443, attempts: 1
      });
      if (domain in times) {
        times[domain] = Math.min(times[domain], time.min);
      } else {
        times[domain] = time.min;
      }
    }
  }

  return { ips: ips, hostnames: reverses, pings: times };
}


(async () => {
  browserData = await getBrowserData('https://www.nu.nl', 2000);
  const entries = browserData.har.log.entries.filter(e => e.request.url);
  const flags = getFlags(entries);
  const dnsData = await getDnsData(flags);
  console.log(dnsData);
})()
