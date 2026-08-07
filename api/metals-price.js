module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const FALLBACK = { silver: 58.00, gold: 2395.00, platinum: 945.00, palladium: 925.00 };

  const accessKey = req.query?.access_key || process.env.METALS_API_KEY || process.env.METALS_API_ACCESS_KEY;
  if (accessKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const resMa = await fetch(`https://metals-api.com/api/latest?access_key=${encodeURIComponent(accessKey)}&base=USD&symbols=XAG,XAU,XPT,XPD`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (resMa.ok) {
        const maData = await resMa.json();
        if (maData?.success && maData?.rates) {
          const rates = maData.rates;
          const getVal = (sym) => rates[`USD${sym}`] || (rates[sym] ? (rates[sym] < 1 ? 1 / rates[sym] : rates[sym]) : null);
          const silver = getVal('XAG');
          const gold = getVal('XAU');
          const platinum = getVal('XPT');
          const palladium = getVal('XPD');

          if (silver && silver > 1) {
            console.log(`✅ metals-api.com: Ag=$${silver}`);
            return res.status(200).json({
              silver: Math.round(silver * 100) / 100,
              gold: gold ? Math.round(gold * 100) / 100 : FALLBACK.gold,
              platinum: platinum ? Math.round(platinum * 100) / 100 : FALLBACK.platinum,
              palladium: palladium ? Math.round(palladium * 100) / 100 : FALLBACK.palladium,
              source: 'metals-api.com',
              ts: Date.now()
            });
          }
        }
      }
    } catch (e) {
      console.error('[metals-api.com handler]', e.message);
    }
  }

  // Try multiple endpoints with proper error handling
  const endpoints = [
    'https://api.metals.live/v1/spot',
    'https://metals.live/api/v1/spot'
  ];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) continue;

      const data = await response.json();
      if (!data) continue;

      const spot = Array.isArray(data) ? data[0] : data;
      const silver = spot?.silver ?? spot?.XAG ?? spot?.xag;
      const gold = spot?.gold ?? spot?.XAU ?? spot?.xau;

      if (silver && silver > 1) {
        console.log(`✅ metals.live: Ag=$${silver}`);
        return res.status(200).json({
          silver: Math.round(silver * 100) / 100,
          gold: gold ? Math.round(gold * 100) / 100 : FALLBACK.gold,
          platinum: spot?.platinum ?? FALLBACK.platinum,
          palladium: spot?.palladium ?? FALLBACK.palladium,
          source: 'metals.live',
          ts: Date.now()
        });
      }
    } catch (error) {
      console.error(`[metals.live ${endpoint}]`, error.message);
      continue;
    }
  }

  console.warn('⚠️ metals.live unavailable — using fallback');
  return res.status(200).json({ ...FALLBACK, source: 'fallback', ts: Date.now() });
}
