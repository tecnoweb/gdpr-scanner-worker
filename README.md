# gdpr-scanner-worker

### Requirements

- NodeJS v14
- Puppeteer

### Installation

Install NodeJS v14:

https://github.com/nodesource/distributions

Install NodeJS dependencies

    npm i puppeteer puppeteer-har tcp-ping qs dns node-fetch
    
Now test the script using:

    nodejs scan.js google.com
    
Or to run the worker:

    PASSWORD=secret123 nodejs scan.js

Demo at: https://tqdev.com/gdpr-scanner/
