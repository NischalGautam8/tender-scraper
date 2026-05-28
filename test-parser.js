const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

async function main() {
  const agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const pageUrl = 'https://www.dtvp.de/Satellite/notice/CXP4D0XMSF5/documents';
  console.log(`Starting session loop for ${pageUrl}...`);
  
  let currentUrl = pageUrl;
  let cookies = [];
  let html = '';
  let finalUrl = '';

  for (let redirectCount = 0; redirectCount < 10; redirectCount++) {
    const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');
    console.log(`Hop ${redirectCount}: GET ${currentUrl}`);
    if (cookieHeader) {
      console.log(`  Sending Cookies: "${cookieHeader}"`);
    }
    
    try {
      const res = await axios.get(currentUrl, {
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
        headers: {
          'User-Agent': agent,
          'Cookie': cookieHeader
        }
      });
      
      const newCookies = res.headers['set-cookie'];
      if (newCookies) {
        cookies = [...cookies, ...newCookies];
        console.log('  Received Cookies:', newCookies);
      }
      
      if (res.status === 302 || res.status === 301) {
        const location = res.headers['location'];
        currentUrl = new URL(location, currentUrl).toString();
      } else {
        html = res.data;
        finalUrl = currentUrl;
        console.log(`  Reached final destination (Status ${res.status})`);
        break;
      }
    } catch (e) {
      console.log(`  Request failed: ${e.message}`);
      break;
    }
  }

  if (!html) {
    console.log('Failed to fetch HTML content.');
    return;
  }

  const $ = cheerio.load(html);
  let zipUrl = null;
  
  $('a[href]').each((i, el) => {
    const href = $(el).attr('href');
    if (href && href.includes('.zip')) {
      zipUrl = new URL(href, finalUrl).toString();
    }
  });

  if (!zipUrl) {
    console.log('No ZIP URL found in final HTML.');
    return;
  }

  console.log(`Attempting download of ZIP: ${zipUrl}`);
  const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');
  
  try {
    const zipRes = await axios.get(zipUrl, {
      headers: {
        'User-Agent': agent,
        'Cookie': cookieHeader,
        'Referer': finalUrl
      },
      responseType: 'arraybuffer'
    });
    console.log(`ZIP Download Succeeded! Status: ${zipRes.status}, Size: ${zipRes.data.length} bytes.`);
    fs.writeFileSync('d:\\Coding\\bond-scraper\\output\\test-zip.zip', zipRes.data);
    console.log('Saved ZIP to output\\test-zip.zip');
  } catch (e) {
    console.log(`ZIP Download Failed with status ${e.response?.status || e.message}`);
  }
}

main();
