/* ============================================
   SILVER PRICE MODULE
   Primary: /api/price (Vercel serverless proxy)
   — all users share one server-side API call,
     Edge-cached for 1 hour.
   Fallback: direct client-side API calls.
   Last resort: hardcoded price (updated daily
   by the serverless function on first cold start).
   ============================================ */

const SilverPrice = (() => {
  const FALLBACK_PRICE     = 63.50;   // Fallback — shown only if all live sources fail (updated August 2026)
  const FALLBACK_GOLD      = 4340.00; // Fallback gold price (updated August 2026)
  const FALLBACK_PLATINUM  = 1750.00; // Fallback platinum price (updated August 2026)
  const FALLBACK_PALLADIUM = 1395.00; // Fallback palladium price (updated August 2026)
  const CACHE_KEY        = 'silverSpotCacheV3';
  const CACHE_DURATION   = 15 * 60 * 1000; // 15 minutes

  let currentPrice          = FALLBACK_PRICE;
  let currentGoldPrice      = FALLBACK_GOLD;
  let currentPlatinumPrice  = FALLBACK_PLATINUM;
  let currentPalladiumPrice = FALLBACK_PALLADIUM;
  let currentChange = null;
  let currentChangePercent = null;
  let currentPrevClose = null;
  let customPrice   = null;
  let listeners     = [];
  let isInitialized = false;

  // Exchange rates — fallback values when live rates unavailable
  const CURRENCIES = {
    USD: { symbol: '$',  rate: 1,      name: 'US Dollar' },
    BRL: { symbol: 'R$', rate: 5.70,   name: 'Real Brasileiro' },
    EUR: { symbol: '€',  rate: 0.92,   name: 'Euro' },
    GBP: { symbol: '£',  rate: 0.79,   name: 'British Pound' },
    CAD: { symbol: 'C$', rate: 1.36,   name: 'Canadian Dollar' },
    AUD: { symbol: 'A$', rate: 1.53,   name: 'Australian Dollar' },
    INR: { symbol: '₹',  rate: 83.50,  name: 'Indian Rupee' },
    PKR: { symbol: '₨',  rate: 278.50, name: 'Pakistani Rupee' },
    AED: { symbol: 'د.إ',rate: 3.67,   name: 'UAE Dirham' },
    SAR: { symbol: '﷼',  rate: 3.75,   name: 'Saudi Riyal' },
    CHF: { symbol: 'Fr', rate: 0.88,   name: 'Swiss Franc' },
    JPY: { symbol: '¥',  rate: 149.50, name: 'Japanese Yen' },
    CNY: { symbol: '¥',  rate: 7.24,   name: 'Chinese Yuan' }
  };

  let activeCurrency = 'USD';

  /* ---- Session cache ---- */
  function getCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (Date.now() - data.ts < CACHE_DURATION) return data;
    } catch (_) {}
    return null;
  }

  function setCache(silver, gold, platinum, palladium, change, changePercent, prevClose) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ silver, gold, platinum, palladium, change, changePercent, prevClose, ts: Date.now() }));
    } catch (_) {}
  }

  /* ---- Fetch helpers ---- */
  async function tryFetch(url, options = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(url, { ...options, signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      clearTimeout(timer);
      return null;
    }
  }

  async function fetchPrice() {
    // ---- Source 1: Server proxy (Edge-cached, best for distributing API load) ----
    const isProduction = window.location.protocol === 'https:' ||
                         (window.location.protocol === 'http:' &&
                          !window.location.hostname.includes('localhost') &&
                          !window.location.hostname.includes('127.0.0.1'));

    if (isProduction) {
      const data = await tryFetch('/api/price');
      if (data?.silver > 0) {
        console.log(`✅ Price via /api/price: $${data.silver} (source: ${data.source})`);
        return { silver: data.silver, gold: data.gold, platinum: data.platinum, palladium: data.palladium, change: data.change, changePercent: data.changePercent, prevClose: data.prevClose };
      }
    }

    // ---- Source 2: Gold-API.com direct ----
    try {
      const gaData = await tryFetch('https://api.gold-api.com/price/XAG');
      if (gaData?.price > 0) {
        console.log(`✅ Gold-API.com: $${gaData.price}`);
        return { silver: gaData.price };
      }
    } catch (e) {
      console.debug('[Gold-API] ', e.message);
    }

    // ---- Source 3: goldprice.org — may work from browser context ----
    try {
      const gpData = await tryFetch('https://data-asg.goldprice.org/dbXRates/USD', { mode: 'cors' });
      if (gpData?.items?.[0]?.xagPrice > 0) {
        const item = gpData.items[0];
        console.log(`✅ goldprice.org: $${item.xagPrice}`);
        return { silver: item.xagPrice, gold: item.xauPrice };
      }
    } catch (e) {
      console.debug('[goldprice] ', e.message);
    }

    // ---- Source 4: metals.live — alternate endpoints ----
    for (const endpoint of [
      'https://metals.live/api/v1/spot',
      'https://api.metals.live/v1/spot'
    ]) {
      try {
        const mlData = await tryFetch(endpoint, { mode: 'cors' });
        if (mlData && typeof mlData === 'object') {
          const spot = Array.isArray(mlData) ? mlData[0] : mlData;
          const silver   = spot?.silver   ?? spot?.XAG ?? spot?.xag;
          const gold     = spot?.gold     ?? spot?.XAU ?? spot?.xau;
          const platinum = spot?.platinum ?? spot?.XPT ?? spot?.xpt;
          const palladium= spot?.palladium?? spot?.XPD ?? spot?.xpd;
          if (silver && silver > 0) {
            console.log(`✅ metals.live: $${silver}`);
            return { silver, gold: gold || null, platinum: platinum || null, palladium: palladium || null };
          }
        }
      } catch (e) {
        console.debug('[metals.live] ', e.message);
      }
    }

    console.warn('⚠️ All precious metals sources failed. Using fallback.');
    return null;
  }

  /* ---- Init ---- */
  async function init() {
    // Serve from session cache instantly if still fresh
    const cached = getCache();
    if (cached?.silver > 0) {
      currentPrice = cached.silver;
      if (cached.gold)          currentGoldPrice        = cached.gold;
      if (cached.platinum)      currentPlatinumPrice    = cached.platinum;
      if (cached.palladium)     currentPalladiumPrice   = cached.palladium;
      if (cached.change        != null) currentChange        = cached.change;
      if (cached.changePercent != null) currentChangePercent = cached.changePercent;
      if (cached.prevClose     != null) currentPrevClose     = cached.prevClose;
      isInitialized = true;
      notifyListeners();
      return currentPrice;
    }

    // Show fallback first so the UI isn't blank
    notifyListeners();

    const prices = await fetchPrice();
    if (prices?.silver > 0) {
      currentPrice = Math.round(prices.silver * 100) / 100;
      if (prices.gold)          currentGoldPrice        = Math.round(prices.gold * 100) / 100;
      if (prices.platinum)      currentPlatinumPrice    = Math.round(prices.platinum * 100) / 100;
      if (prices.palladium)     currentPalladiumPrice   = Math.round(prices.palladium * 100) / 100;
      if (prices.change        != null) currentChange        = Math.round(prices.change * 100) / 100;
      if (prices.changePercent != null) currentChangePercent = Math.round(prices.changePercent * 100) / 100;
      if (prices.prevClose     != null) currentPrevClose     = Math.round(prices.prevClose * 100) / 100;
      setCache(currentPrice, currentGoldPrice, currentPlatinumPrice, currentPalladiumPrice, currentChange, currentChangePercent, currentPrevClose);
    }

    isInitialized = true;
    notifyListeners();
    return currentPrice;
  }

  /* ---- Public API ---- */
  function getPrice()           { return customPrice !== null ? customPrice : currentPrice; }
  function getGoldPrice()       { return currentGoldPrice; }
  function getPlatinumPrice()   { return currentPlatinumPrice; }
  function getPalladiumPrice()  { return currentPalladiumPrice; }

  function getPriceInCurrency(currency) {
    return getPrice() * (CURRENCIES[currency] || CURRENCIES.USD).rate;
  }

  function formatInCurrency(usdValue, currency) {
    const cur = CURRENCIES[currency || activeCurrency] || CURRENCIES.USD;
    return cur.symbol + (usdValue * cur.rate).toFixed(2);
  }

  function setCustomPrice(price) { customPrice = price; notifyListeners(); }
  function clearCustomPrice()    { customPrice = null;  notifyListeners(); }
  function isCustom()            { return customPrice !== null; }

  function setCurrency(code) {
    if (CURRENCIES[code]) { activeCurrency = code; notifyListeners(); }
  }

  function getCurrency()           { return activeCurrency; }
  function getCurrencySymbol(code) { return (CURRENCIES[code || activeCurrency] || CURRENCIES.USD).symbol; }
  function getPricePerGram()       { return getPrice() / 31.1035; }
  function getPricePerKg()         { return getPrice() * (1000 / 31.1035); }
  function getPricePerDwt()        { return getPrice() / 20; }
  function getChange()             { return currentChange; }
  function getChangePercent()      { return currentChangePercent; }
  function getPrevClose()          { return currentPrevClose; }

  function onPriceUpdate(callback) {
    listeners.push(callback);
    if (isInitialized) callback(getPrice());
  }

  function notifyListeners() { listeners.forEach(fn => fn(getPrice())); }

  init();

  return {
    init, getPrice, getGoldPrice, getPlatinumPrice, getPalladiumPrice,
    getPriceInCurrency, formatInCurrency,
    setCustomPrice, clearCustomPrice, isCustom,
    setCurrency, getCurrency, getCurrencySymbol,
    getPricePerGram, getPricePerKg, getPricePerDwt,
    getChange, getChangePercent, getPrevClose,
    onPriceUpdate, CURRENCIES, FALLBACK_PRICE
  };
})();
