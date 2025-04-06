const axios = require('axios');
const cheerio = require('cheerio');
const { SocksProxyAgent } = require('socks-proxy-agent');
const torProxy = new SocksProxyAgent('socks5h://127.0.0.1:9050');
async function scrapeBooks(bookName) {
  try {
    console.log(`[SCRAPER] Fetching search results...`);
    const url = `https://1lib.sk/s/${bookName}`;
    console.log(url)
    const response = await axios.get(url, {
      //httpAgent: torProxy,
      //httpsAgent: torProxy,
      headers: {
        'User-Agent': 'curl/8.12.1',
	'Accept': '*/*',
      },
    });

    const $ = cheerio.load(response.data);
    const books = [];

    $('z-bookcard').each((index, element) => {
      books.push({
        numero: index + 1,
        id: $(element).attr('id'),
        isbn: $(element).attr('isbn'),
        termshash: $(element).attr('termshash'),
        href: $(element).attr('href'),
        download: $(element).attr('download'),
        publisher: $(element).attr('publisher'),
        language: $(element).attr('language'),
        year: $(element).attr('year'),
        extension: $(element).attr('extension'),
        filesize: $(element).attr('filesize'),
        rating: $(element).attr('rating'),
        coverImage: $(element).find('img').attr('data-src') || null,
        title: $(element).find('[slot="title"]').text().trim() || null,
        author: $(element).find('[slot="author"]').text().trim() || null,
      });
    });

    console.log(`[SCRAPER] Found ${books.length} books.`);
    return books;
  } catch (error) {
    console.error(`[SCRAPER] Error fetching search page: ${error.message}`);
    return [];
  }
}

module.exports = scrapeBooks;
