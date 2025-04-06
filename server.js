const express = require('express');
const cors = require('cors');
const scrapeBooks = require('./scrape'); // Import the scrape function
const app = express();
const TorControl = require('tor-control');

const torOptions = {
  password: 'password1234',  // Must match what you used above
  port: 9051,
  host: '127.0.0.1'
};

function rotateTorIP() {
  const control = new TorControl(torOptions);

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




app.use(cors({
    exposedHeaders: ['Content-Disposition']
}));
app.use(express.json());

app.post('/scrape', async (req, res) => {
  console.log(`[SERVER] Received request:`, req.body);

  const bookName = req.body.bookName;
  if (!bookName) {
    console.log(`[SERVER] Missing bookName in request.`);
    return res.status(400).json({ error: 'Book name is required' });
  }

  console.log(`[SERVER] Scraping books for: ${bookName}`);
  try {
    const books = await scrapeBooks(bookName);
    console.log(`[SERVER] Returning ${books.length} books.`);
    res.json(books); // Send the list of books as the response
  } catch (error) {
    console.error(`[SERVER] Scraping failed:`, error);
    res.status(500).json({ error: 'Failed to scrape the books' });
  }
});

// Endpoint to handle download request
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const fs = require('fs');
const path = require('path');

// Proxy configuration for Tor
const torProxy = new SocksProxyAgent('socks5h://127.0.0.1:9050');

// Endpoint to handle download request

// Endpoint to handle download request
app.post('/download', async (req, res) => {
  const { downloadPath } = req.body;
  // Construct the full URL using the provided downloadPath
  const url = `https://1lib.sk${downloadPath}`;
  // Define custom User-Agent
  const customUserAgent = 'curl/8.12.1';
  
  try {
    console.log(`[SERVER] Downloading from: ${url}`);
    // Make the request to download the file, following redirects
    const response = await axios.get(url, {
      httpAgent: torProxy,
      httpsAgent: torProxy,
      headers: {
        'User-Agent': customUserAgent,
        'Accept': '*/*',
      },
      responseType: 'arraybuffer', // Changed to arraybuffer to allow checking content
      maxRedirects: 5, // Limit redirects if necessary
    });

    // Get the content type
    const contentType = response.headers['content-type'] || '';
    
    // Check if it's HTML and contains the IP block message
    if (contentType.includes('text/html')) {
      // Convert buffer to string to check content
      const htmlContent = response.data.toString('utf-8');
      
      if (htmlContent.includes('24 hours')) {
        console.log('[SERVER] IP block detected!');
        return res.status(403).json({ 
          error: 'IP_BLOCKED',
          message: 'Your IP address has been temporarily blocked. Please try again later or use a different connection.'
        });
      }

      if (htmlContent.includes('wrongHash')) {
        console.log('[SERVER] Wrong hash detected!');
        return res.status(400).json({ 
          error: 'WRONG_HASH',
          message: 'Wrong hash'
        });
      }


    }
    
    // Get the filename from the Content-Disposition header or fall back to default
    const contentDisposition = response.headers['content-disposition'];
    console.log(contentDisposition);
    let fileName = "downloaded_file";
    if (contentDisposition) {
      let match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/);
      if (match) {
        fileName = decodeURIComponent(match[1]); // Decode the UTF-8 encoded filename
      } else {
        // If filename*= is not found, try filename=
        match = contentDisposition.match(/filename="([^"]+)"/);
        if (match) {
          fileName = match[1]; // Use plain filename
        }
      }
    }
    console.log(fileName);
    
    // Set the response headers for file download
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', response.headers['content-type']);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    
    // Send the file data
    res.send(response.data);
    
  } catch (error) {
    console.error(`[SERVER] Download failed: ${error.message}`);
    res.status(500).json({ error: 'Failed to download the file' });
  }
});

app.post('/rotate-ip', async (req, res) => {
  try {
    await rotateTorIP();
    res.status(200).json({ message: 'New Tor identity requested successfully.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to rotate Tor IP.' });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[SERVER] Running on port ${PORT}`);
});
