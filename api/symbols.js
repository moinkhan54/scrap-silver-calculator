/* ============================================
   VERCEL SERVERLESS FUNCTION — /api/symbols

   Proxies request to Metals-API symbols endpoint:
   https://metals-api.com/api/symbols?access_key=...

   Uses query parameter `access_key` or environment
   variable `METALS_API_KEY` / `METALS_API_ACCESS_KEY`.
   ============================================ */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const accessKey = req.query?.access_key ||
                    process.env.METALS_API_KEY ||
                    process.env.METALS_API_ACCESS_KEY;

  const FALLBACK_SYMBOLS = {
    "XAG": "Silver (troy ounce)",
    "XAU": "Gold (troy ounce)",
    "XPT": "Platinum (troy ounce)",
    "XPD": "Palladium (troy ounce)",
    "USD": "United States Dollar",
    "EUR": "Euro",
    "GBP": "British Pound Sterling",
    "CAD": "Canadian Dollar",
    "AUD": "Australian Dollar",
    "INR": "Indian Rupee",
    "PKR": "Pakistani Rupee",
    "AED": "United Arab Emirates Dirham",
    "SAR": "Saudi Riyal",
    "CHF": "Swiss Franc",
    "JPY": "Japanese Yen",
    "CNY": "Chinese Yuan"
  };

  if (!accessKey) {
    return res.status(200).json({
      success: true,
      message: 'No access_key provided. Returning default supported precious metals & currency symbols.',
      symbols: FALLBACK_SYMBOLS,
      source: 'fallback'
    });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);

    const targetUrl = `https://metals-api.com/api/symbols?access_key=${encodeURIComponent(accessKey)}`;
    const response = await fetch(targetUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: `Metals-API responded with status code ${response.status}`,
        symbols: FALLBACK_SYMBOLS,
        source: 'fallback'
      });
    }

    const data = await response.json();
    return res.status(200).json({
      ...data,
      source: 'metals-api.com'
    });
  } catch (error) {
    console.error('[Metals-API symbols]', error.message);
    return res.status(200).json({
      success: false,
      error: error.message,
      symbols: FALLBACK_SYMBOLS,
      source: 'fallback'
    });
  }
};
