# gdpr-scanner-worker

### Requirements

- PHP 7
- Chromium (running "headless")
- NPM package "chrome-har-capturer"

### Installation

Install PHP and Chromium using:

    sudo apt install php-cli php-curl chromium-browser npm
    sudo npm install -g chrome-har-capturer
    
Now test the script using:

    ./scan https://google.com
    
Output should be:

    ["google.com",[],10,"EU","Netherlands","Google LLC"]
    ["www.google.com",[],10,"EU","Netherlands","Google LLC"]
    ["ssl.gstatic.com",[],10,"","United States","Google LLC"]
    ["www.gstatic.com",[],10,"","United States","Google LLC"]
    ["apis.google.com",[],10,"EU","Netherlands","Google LLC"]
    ["ogs.google.com",[],10,"","United States","Google LLC"]
    ["adservice.google.com",[],10,"EU","Netherlands","Google LLC"]

From my computer in Amsterdam, that is.

Demo at: https://tqdev.com/gdpr-scanner/
