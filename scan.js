// npm i puppeteer puppeteer-har tcp-ping qs dns node-fetch
const puppeteer = require('puppeteer');
const PuppeteerHar = require('puppeteer-har');
const tcpp = require('tcp-ping');
const util = require('util');
const qs = require('qs');
const dns = require('dns');
const fetch = require('node-fetch');

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

  data.cookies = await page._client.send('Network.getAllCookies');

  data.localStorage = await page.evaluate(() => Object.assign({}, window.localStorage));

  data.sessionStorage = await page.evaluate(() => Object.assign({}, window.sessionStorage));

  data.caches = await page.evaluate(async () => {
    const result = {};
    if ('caches' in window) {
      const cacheNames = await window.caches.keys();
      for (const name of cacheNames) {
        result[name] = {};
        const cache = await window.caches.open(name);
        for (const request of await cache.keys()) {
          response = await cache.match(request);
          result[name][request.url] = response;
        }
      }
    }
    return result;
  });

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

    for (database of databases) {
      const db = await connect(database);
      const dbName = db.name;
      result[dbName] = {};
      for (objectStoreName of db.objectStoreNames) {
        result[dbName][objectStoreName] = [];
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
  return index == arr.length - 1 || arr[index + 1] != elem;
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
    return (u.host == gaDomain) && (u.pathname.indexOf('/collect') != -1);
  });
  for (e of gaEntries) {
    const get = e.request.queryString.reduce((get, pair) => { get[pair.name] = pair.value; return get; }, {});
    const post = e.request.postData ? qs.parse(e.request.postData.text) : {};
    const aip = 'aip' in get || 'aip' in post;
    flags[gaDomain][aip ? 'ga_aip' : 'ga_no_aip'] = true;
  }

  // set domain flags
  const domainFlags = {
    'fonts.googleapis.com': 'g_fonts',
    'stats.g.doubleclick.net': 'g_dc_ads',
    'connect.facebook.net': 'fb_connect',
    'ping.chartbeat.net': 'chartbeat',
    'bam.nr-data.net': 'nr_in_us'
  };
  for (const domain of Object.keys(flags)) {
    if (domain in domainFlags) {
      const flag = domainFlags[domain];
      flags[domain][flag] = true;
    }
  }

  return flags;
};

const getDnsData = async (flags) => {

  const domains = Object.keys(flags);

  const nslookup = util.promisify(dns.lookup);
  const lookups = await Promise.all(domains.map((domain) => nslookup(domain)));
  const ips = domains.reduce((acc, domain, i) => (acc[domain] = lookups[i].address, acc), {});

  const rlookup = util.promisify(dns.reverse);
  const rlookups = await Promise.all(domains.map((domain) => rlookup(ips[domain]).catch(_ => [''])));
  const reverses = domains.reduce((acc, domain, i) => (acc[domain] = rlookups[i][0], acc), {});

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
};

const getLocationData = async (ips) => {
  const results = await fetch('http://ip-api.com/batch?fields=continentCode,country,org', {
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    method: 'POST',
    body: JSON.stringify(Object.values(ips))
  }).then(res => res.json());
  return Object.keys(ips).reduce((acc, domain, i) => (acc[domain] = results[i], acc), {});
};


const getData = async (url) => {
  browserData = await getBrowserData(url, 2000);
  const entries = browserData.har.log.entries.filter(e => e.request.url);
  const flags = getFlags(entries);
  const dnsData = await getDnsData(flags);
  const locations = await getLocationData(dnsData.ips);
  const data = { domains: [], cookies: [], sessionStorage: [], localStorage: [] }
  for (domain of Object.keys(flags)) {
    const result = { domain: domain }
    result.flag = Object.keys(flags[domain]);
    result.ping = Math.round(dnsData.pings[domain]);
    result.hostname = dnsData.hostnames[domain];
    result.contintent = locations[domain].continentCode == 'EU' ? 'EU' : '';
    result.country = locations[domain].country;
    result.organization = locations[domain].org;
    data.domains.push(result);
  }
  for (cookie of browserData.cookies.cookies) {
    const fields = ['name', 'value', 'domain', 'path', 'expires', 'size', 'httpOnly', 'secure', 'session', 'priority', 'sameSite']
    for (const field of fields) {
      if (!(field in cookie)) {
        cookie[field] = null;
      }
    }
    data.cookies.push(cookie);
  }
  for (key of Object.keys(browserData.sessionStorage)) {
    data.sessionStorage.push({ key: key, value: browserData.sessionStorage[key] });
  }
  for (key of Object.keys(browserData.localStorage)) {
    data.localStorage.push({ key: key, value: browserData.localStorage[key] });
  }
  return data;
};

(async () => {
  if (process.argv.length > 2) {
    const arg = process.argv[2];
    const url = arg.startsWith('http') ? arg : 'https://' + arg;
    const data = await getData(url);
    for (key of Object.keys(data)) {
      console.log('==' + key + '==');
      for (record of data[key]) {
        console.log(JSON.stringify(record));
      }
    }
  } else {
    while (true) {
      await new Promise(r => setTimeout(r, 1000));
      const str = await fetch('https://tqdev.com/gdpr-scanner/get.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: qs.stringify({ password: process.env.PASSWORD })
      }).then(res => res.text())
      if (str == '') continue;
      const response = JSON.parse(str);
      console.log(response.url);
      try {
        response.data = await getData(response.url);
      } catch {
        continue;
      }
      await fetch('https://tqdev.com/gdpr-scanner/put.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: qs.stringify({ password: process.env.PASSWORD, response: JSON.stringify(response) })
      })
    }
  }
})()