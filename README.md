# gdpr-scanner-worker

### Requirements

- PHP 7
- Chromium Headless

### Installation

Install PHP and Chromium Headless using:

    sudo apt install php-cli chromium-browser
    
Now test the script using:

    ./scan https://google.com
    
Output should be:

    ["google.com",10,"EU","Netherlands","Google LLC"]
    ["www.google.com",10,"EU","Netherlands","Google LLC"]
    ["ssl.gstatic.com",10,"","United States","Google LLC"]
    ["www.gstatic.com",10,"","United States","Google LLC"]
    ["apis.google.com",10,"EU","Netherlands","Google LLC"]
    ["ogs.google.com",10,"","United States","Google LLC"]
    ["adservice.google.com",10,"EU","Netherlands","Google LLC"]

From my computer in Amsterdam, that is.
