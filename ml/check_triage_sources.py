import urllib.request
import re

url = 'https://ftp.cdc.gov/pub/health_statistics/nchs/datasets/NHAMCS/'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        html = resp.read().decode('utf-8')
        matches = re.findall(r'href=[\'"]?([^\'" >]+)', html, re.I)
        ed_files = [m for m in matches if 'ed20' in m.lower() or 'ed19' in m.lower()]
        print("Found NHAMCS ED files:", ed_files[-15:])
except Exception as e:
    print("Error querying CDC:", e)
