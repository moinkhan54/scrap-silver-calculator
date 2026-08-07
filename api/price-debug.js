/* ============================================
   DEBUG ENDPOINT — tests which price sources work from Vercel
   Access: https://scrapsilvercalculater.com/api/price-debug
   ============================================ */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const results = {};
  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  async function testAPI(name, url, options = {}) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout || 5000);
      const r = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      const text = await r.text();
      return {
        status: r.status,
        ok: r.ok,
        isHTML: text.trim().startsWith('<'),
        responseLen: text.length,
        preview: text.substring(0, 200)
      };
    } catch (err) {
      return {
        error: err.name,
        message: err.message
      };
    }
  }

  // Test 1: GoldAPI.io
  results['GoldAPI.io'] = await testAPI('GoldAPI', 'https://www.goldapi.io/api/XAG/USD', {
    headers: { ...HEADERS, 'x-access-token': 'goldapi-1230smo2lqnxm-io' },
    timeout: 5000
  });

  // Test 2: metals.live main
  results['metals.live (main)'] = await testAPI('metals.live', 'https://metals.live/api/v1/spot', {
    headers: HEADERS,
    timeout: 5000
  });

  // Test 3: metals.live alt
  results['metals.live (alt)'] = await testAPI('metals.live-alt', 'https://api.metals.live/v1/spot', {
    headers: HEADERS,
    timeout: 5000
  });

  // Test 4: goldprice.org
  results['goldprice.org'] = await testAPI('goldprice', 'https://data-asg.goldprice.org/dbXRates/USD', {
    headers: { ...HEADERS, 'Referer': 'https://www.goldprice.org/' },
    timeout: 5000
  });

  // Test 5: Yahoo Finance
  results['Yahoo Finance'] = await testAPI('yahoo', 'https://query1.finance.yahoo.com/v8/finance/chart/XAG=X?interval=1d&range=1d', {
    headers: HEADERS,
    timeout: 5000
  });

  // Test 6: Finnhub
  results['Finnhub'] = await testAPI('finnhub', 'https://finnhub.io/api/v1/quote?symbol=XAG_X&token=demo', {
    headers: HEADERS,
    timeout: 4000
  });

  // Test 7: Metals-API symbols
  const testKey = req.query?.access_key || process.env.METALS_API_KEY || process.env.METALS_API_ACCESS_KEY || 'demo';
  results['Metals-API (symbols)'] = await testAPI('metals-api-symbols', `https://metals-api.com/api/symbols?access_key=${testKey}`, {
    headers: HEADERS,
    timeout: 5000
  });

  // Test 8: Metals-API latest rates
  results['Metals-API (latest)'] = await testAPI('metals-api-latest', `https://metals-api.com/api/latest?access_key=${testKey}&base=USD&symbols=XAG,XAU`, {
    headers: HEADERS,
    timeout: 5000
  });

  // Test 9: ExchangeRate API (control test - should work)
  results['ExchangeRate-API (control)'] = await testAPI('exchange', 'https://api.exchangerate-api.com/v4/latest/USD', {
    headers: HEADERS,
    timeout: 4000
  });

  return res.status(200).json({
    timestamp: new Date().toISOString(),
    tests: results
  });
};
