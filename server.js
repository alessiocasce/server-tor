const express = require('express');
const cors = require('cors');
const scrapeBooks = require('./scrape');
const app = express();
const TorControl = require('tor-control');
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const fs = require('fs');
const path = require('path');

// Proxy configuration for Tor
const torProxy = new SocksProxyAgent('socks5h://127.0.0.1:9050');

// Tor IP Rotation
const torOptions = {
  password: 'password1234',
  port: 9051,
  host: '127.0.0.1'
};
const control = new TorControl(torOptions);
function rotateTorIP() {
  return new Promise((resolve, reject) => {
    control.signalNewnym((err) => {
      if (err) {
        console.error("[TOR] Failed to rotate IP:", err);
        reject(err);
      } else {
        console.log("[TOR] New Tor identity requested.");
        resolve();
      }
    });
  });
}

async function getFreshDownloadPath(bookTitle, oldId) {
  console.log(`[SERVER] Attempting to scrape again for book: ${bookTitle}`);
  const books = await scrapeBooks(bookTitle);
  const fresh = books.find(book => book.id === oldId);
  if (fresh) {
    console.log(`[SERVER] Found fresh path for book ID ${oldId}`);
  } else {
    console.warn(`[SERVER] Could not find fresh path for book ID ${oldId}`);
  }
  return fresh?.download || null;
}

app.use(cors({ exposedHeaders: ['Content-Disposition'] }));
app.use(express.json());

app.post('/scrape', async (req, res) => {
  const bookName = req.body.bookName;
  if (!bookName) {
    console.log(`[SERVER] Missing bookName in request.`);
    return res.status(400).json({ error: 'Book name is required' });
  }

  console.log(`[SERVER] Scraping books for: ${bookName}`);
  try {
    const books = await scrapeBooks(bookName);
    console.log(`[SERVER] Returning ${books.length} books.`);
    res.json(books);
  } catch (error) {
    console.error(`[SERVER] Scraping failed:`, error);
    res.status(500).json({ error: 'Failed to scrape the books' });
  }
});

app.post('/download', async (req, res) => {
  let { downloadPath, bookTitle, bookId } = req.body;
  let url = `https://1lib.sk${downloadPath}`;
  const customUserAgent = 'curl/8.12.1';
  console.log(`[SERVER] Starting download from: ${url}`);

  async function attemptDownload(targetUrl) {
    console.log(`[SERVER] Attempting download from: ${targetUrl}`);
    return await axios.get(targetUrl, {
      httpAgent: torProxy,
      httpsAgent: torProxy,
      headers: {
        'User-Agent': customUserAgent,
        'Accept': '*/*',
      },
      responseType: 'arraybuffer',
      maxRedirects: 5,
    });
  }

  try {
    let response = await attemptDownload(url);
    const contentType = response.headers['content-type'] || '';

    if (contentType.includes('text/html')) {
      const htmlContent = response.data.toString('utf-8');

      if (htmlContent.includes('24 hours')) {
        console.log('[SERVER] IP block detected! Rotating IP...');
        await rotateTorIP();
        console.log('[SERVER] Re-scraping to get a fresh download link...');

        const newDownloadPath = await getFreshDownloadPath(bookTitle, bookId);
        if (!newDownloadPath) {
          console.error('[SERVER] Failed to get new download path after rotating IP.');
          return res.status(404).json({ error: 'Fresh download path not found.' });
        }

        url = `https://1lib.sk${newDownloadPath}`;
        console.log(`[SERVER] Retrying download from new URL: ${url}`);
        response = await attemptDownload(url);
      }

      if (htmlContent.includes('wrongHash')) {
        console.warn('[SERVER] Wrong hash detected in HTML. Re-scraping for new link...');
        const newDownloadPath = await getFreshDownloadPath(bookTitle, bookId);
        if (!newDownloadPath) {
          console.error('[SERVER] Failed to get new download path due to wrong hash.');
          return res.status(404).json({ error: 'Fresh download path not found due to wrong hash.' });
        }

        url = `https://1lib.sk${newDownloadPath}`;
        console.log(`[SERVER] Retrying download from new URL due to wrong hash: ${url}`);
        response = await attemptDownload(url);
      }
    }

    const contentDisposition = response.headers['content-disposition'];
    console.log(`[SERVER] Content-Disposition: ${contentDisposition}`);
    let fileName = "downloaded_file";
    if (contentDisposition) {
      let match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/);
      if (match) fileName = decodeURIComponent(match[1]);
      else {
        match = contentDisposition.match(/filename="([^"]+)"/);
        if (match) fileName = match[1];
      }
    }
    console.log(`[SERVER] File name resolved to: ${fileName}`);

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', response.headers['content-type']);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send(response.data);
    console.log('[SERVER] Download successfully completed and sent to client.');

  } catch (error) {
    console.error(`[SERVER] Download failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to download the file' });
  }
});

app.post('/rotate-ip', async (req, res) => {
  try {
    console.log('[SERVER] Received request to manually rotate Tor IP');
    await rotateTorIP();
    res.status(200).json({ message: 'New Tor identity requested successfully.' });
  } catch (error) {
    console.error('[SERVER] Failed to rotate IP via /rotate-ip endpoint:', error);
    res.status(500).json({ error: 'Failed to rotate Tor IP.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[SERVER] Running on port ${PORT}`);
});
