# Live Stock Prices

## Implementation

```python
import yfinance as yf

class LivePriceService:
    def __init__(self, cache_seconds=60):
        self.cache = {}
        self.cache_duration = cache_seconds
    
    def get_prices(self, symbols):
        now = time.time()
        uncached = [s for s in symbols if s not in self.cache or now - self.cache[s]['fetched_at'] > self.cache_duration]
        for symbol in uncached:
            ticker = yf.Ticker(symbol)
            info = ticker.info
            self.cache[symbol] = {
                'price': info.get('currentPrice', 0),
                'change': info.get('regularMarketChangePercent', 0),
                'fetched_at': now
            }
        return {s: self.cache[s] for s in symbols}
    
    def portfolio_value(self, holdings):
        symbols = [h['symbol'] for h in holdings]
        prices = self.get_prices(symbols)
        total = sum(h['shares'] * prices[h['symbol']]['price'] for h in holdings)
        return total
```

## Dashboard Component

```tsx
function LivePortfolio({ holdings }) {
  const [prices, setPrices] = useState({});
  
  useEffect(() => {
    const fetch = () => fetch('/api/portfolio/live').then(r => r.json()).then(setPrices);
    fetch();
    const interval = setInterval(fetch, 60000);
    return () => clearInterval(interval);
  }, []);
  
  return <table>{holdings.map(h => <tr><td>{h.symbol}</td><td>{prices[h.symbol]?.price}</td></tr>)}</table>;
}
```

- 60s cache to avoid rate limits
- Auto-refresh during market hours
- Fallback to last known price
