/* ============================================
   VERCEL SERVERLESS FUNCTION — /api/price

   Sources (in priority order):
   1. Gold-API.com  — free JSON API, fast & accurate live spot prices
   2. Yahoo Finance SI=F — free futures spot quote with change & % change
   3. Metals-API.com — if access_key configured
   4. goldprice.org / metals.live fallback
   5. Hardcoded fallback (updated August 2026)
   ============================================ */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Cache response for 5 minutes (s-maxage=300) so edge nodes stay fresh
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

  const FALLBACK_SILVER    = 63.50;
  const FALLBACK_GOLD      = 4340.00;
  const FALLBACK_PLATINUM  = 1750.00;
  const FALLBACK_PALLADIUM = 1395.00;

  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*'
  };

  async function tryFetchJSON(url, options = {}, timeoutMs = 6000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { ...options, signal: ctrl.signal });
      clearTimeout(timer);
      if (!r.ok) return null;
      return await r.json();
    } catch (_) {
      clearTimeout(timer);
      return null;
    }
  }

  // ---- 1. Gold-API.com (Primary: Free, direct spot prices) ----
  try {
    const [xagData, xauData] = await Promise.all([
      tryFetchJSON('https://api.gold-api.com/price/XAG', { headers: HEADERS }),
      tryFetchJSON('https://api.gold-api.com/price/XAU', { headers: HEADERS })
    ]);

    const silver = xagData?.price;
    const gold = xauData?.price;

    if (silver && silver > 1) {
      console.log(`✅ Gold-API.com: Ag=$${silver}`);

      // Try fetching Yahoo SI=F in background or quickly to get prevClose / change
      let change = null;
      let changePercent = null;
      let prevClose = null;

      try {
        const yhData = await tryFetchJSON(
          'https://query1.finance.yahoo.com/v8/finance/chart/SI=F?interval=1d&range=1d',
          { headers: HEADERS },
          3000
        );
        const meta = yhData?.chart?.result?.[0]?.meta;
        prevClose = meta?.previousClose ?? meta?.chartPreviousClose ?? null;
        if (prevClose && prevClose > 0) {
          prevClose = Math.round(prevClose * 100) / 100;
          change = Math.round((silver - prevClose) * 100) / 100;
          changePercent = Math.round(((silver - prevClose) / prevClose * 100) * 100) / 100;
        }
      } catch (_) {}

      return res.status(200).json({
        silver: Math.round(silver * 100) / 100,
        gold: gold ? Math.round(gold * 100) / 100 : FALLBACK_GOLD,
        platinum: FALLBACK_PLATINUM,
        palladium: FALLBACK_PALLADIUM,
        change,
        changePercent,
        prevClose,
        source: 'gold-api.com',
        ts: Date.now()
      });
    }
  } catch (e) {
    console.error('[Gold-API] ', e.message);
  }

  // ---- 2. Yahoo Finance SI=F (Silver Futures) ----
  try {
    const yhData = await tryFetchJSON(
      'https://query1.finance.yahoo.com/v8/finance/chart/SI=F?interval=1d&range=1d',
      { headers: HEADERS }
    );
    const meta = yhData?.chart?.result?.[0]?.meta;
    const silverPrice = meta?.regularMarketPrice;
    if (silverPrice && silverPrice > 1) {
      console.log(`✅ Yahoo SI=F: Ag=$${silverPrice}`);
      const prevClose = meta?.previousClose ?? meta?.chartPreviousClose ?? null;
      return res.status(200).json({
        silver: Math.round(silverPrice * 100) / 100,
        gold: FALLBACK_GOLD,
        platinum: FALLBACK_PLATINUM,
        palladium: FALLBACK_PALLADIUM,
        change: prevClose ? Math.round((silverPrice - prevClose) * 100) / 100 : null,
        changePercent: prevClose ? Math.round(((silverPrice - prevClose) / prevClose * 100) * 100) / 100 : null,
        prevClose: prevClose ? Math.round(prevClose * 100) / 100 : null,
        source: 'yahoo-futures',
        ts: Date.now()
      });
    }
  } catch (e) {
    console.error('[Yahoo SI=F] ', e.message);
  }

  // ---- 3. Metals-API.com (If key provided) ----
  const metalsApiKey = req.query?.access_key || process.env.METALS_API_KEY || process.env.METALS_API_ACCESS_KEY;
  if (metalsApiKey) {
    try {
      const maData = await tryFetchJSON(
        `https://metals-api.com/api/latest?access_key=${encodeURIComponent(metalsApiKey)}&base=USD&symbols=XAG,XAU,XPT,XPD`
      );
      if (maData?.success && maData?.rates) {
        const rates = maData.rates;
        const getVal = (sym) => rates[`USD${sym}`] || (rates[sym] ? (rates[sym] < 1 ? 1 / rates[sym] : rates[sym]) : null);
        const silver = getVal('XAG');
        const gold = getVal('XAU');
        const platinum = getVal('XPT');
        const palladium = getVal('XPD');

        if (silver && silver > 1) {
          console.log(`✅ Metals-API.com: Ag=$${silver}`);
          return res.status(200).json({
            silver: Math.round(silver * 100) / 100,
            gold: gold ? Math.round(gold * 100) / 100 : FALLBACK_GOLD,
            platinum: platinum ? Math.round(platinum * 100) / 100 : FALLBACK_PLATINUM,
            palladium: palladium ? Math.round(palladium * 100) / 100 : FALLBACK_PALLADIUM,
            source: 'metals-api.com',
            ts: Date.now()
          });
        }
      }
    } catch (e) {
      console.error('[Metals-API] ', e.message);
    }
  }

  // ---- 4. metals.live ----
  for (const endpoint of ['https://api.metals.live/v1/spot', 'https://metals.live/api/v1/spot']) {
    try {
      const mlData = await tryFetchJSON(endpoint);
      if (mlData) {
        const spot = Array.isArray(mlData) ? mlData[0] : mlData;
        const silver = spot?.silver ?? spot?.XAG ?? spot?.xag;
        const gold = spot?.gold ?? spot?.XAU ?? spot?.xau;
        if (silver > 1) {
          console.log(`✅ metals.live: Ag=$${silver}`);
          return res.status(200).json({
            silver: Math.round(silver * 100) / 100,
            gold: gold ? Math.round(gold * 100) / 100 : FALLBACK_GOLD,
            platinum: FALLBACK_PLATINUM,
            palladium: FALLBACK_PALLADIUM,
            source: 'metals.live',
            ts: Date.now()
          });
        }
      }
    } catch (e) {
      console.error('[metals.live] ', e.message);
    }
  }

  // ---- 5. Hardcoded fallback ----
  console.warn('⚠️ All price sources failed — using fallback');
  return res.status(200).json({
    silver: FALLBACK_SILVER,
    gold: FALLBACK_GOLD,
    platinum: FALLBACK_PLATINUM,
    palladium: FALLBACK_PALLADIUM,
    source: 'fallback',
    ts: Date.now()
  });
};
