# Polymarket — Prediction Markets

Query Polymarket prediction markets: prices, orderbooks, history.

```bash
polymarket markets --category "crypto"
polymarket prices "Will ETH reach $10k by 2026?"
polymarket orderbook "binary-market-id"
polymarket history "market-id"
```

Categories: crypto, politics, sports, science, etc. Returns binary market probabilities (0-100%).
