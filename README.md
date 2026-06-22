# FundedWealth Terminal

Professional-grade Indian trading terminal for stocks, futures, options, commodities, and currency derivatives.

**URL:** `terminal.fundedwealth.com`

## Features

- **Multi-segment trading**: NSE, BSE, NFO, MCX, CDS
- **TradingView-style charts** with 9 timeframes, 10+ indicators, drawing tools
- **Real-time market data** via WebSocket (Angel One primary, Dhan backup)
- **Full option chain** with Greeks (IV, Delta, Gamma, Theta, Vega)
- **Level 5 Market Depth** (DOM)
- **One-click order execution**: Market, Limit, SL, SL-M, Bracket, Cover
- **Position management**: Exit, Reverse, Add, Modify
- **Watchlists**: Unlimited with color tags and drag-drop
- **Keyboard shortcuts**: F1-F4 for quick trading, Ctrl+K search
- **3 themes**: TradingView Dark, FundedWealth Blue, Light

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, TailwindCSS, Zustand, TanStack Query |
| Charts | Lightweight Charts (TradingView) |
| Backend | Node.js, Express, WebSocket |
| Cache | Redis |
| Database | Supabase PostgreSQL |
| Deployment | Docker, Nginx |

## Quick Start

### Development

```bash
# Install frontend dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..

# Start backend (port 4000)
cd server && npm run dev

# Start frontend (port 3000) - in a new terminal
npm run dev
```

### Production

```bash
# Build frontend
npm run build

# Docker deployment
docker-compose up -d
```

## Configuration

Copy `server/.env.example` to `server/.env` and configure:

```env
# Angel One SmartAPI (Primary)
ANGEL_API_KEY=your_key
ANGEL_CLIENT_ID=your_client_id
ANGEL_PASSWORD=your_password
ANGEL_TOTP_SECRET=your_totp_secret

# Dhan (Backup)
DHAN_ACCESS_TOKEN=your_token
DHAN_CLIENT_ID=your_client_id

# Redis
REDIS_URL=redis://localhost:6379
```

## Architecture

```
FundedWealth Dashboard → "FW Terminal" button → terminal.fundedwealth.com
                                                         │
                                                    ┌────┴────┐
                                                    │ Frontend │
                                                    │  React   │
                                                    └────┬────┘
                                                         │ WebSocket + REST
                                                    ┌────┴────┐
                                                    │ Backend  │
                                                    │ Express  │
                                                    └────┬────┘
                                                         │
                                              ┌──────────┼──────────┐
                                              │          │          │
                                         ┌────┴──┐  ┌───┴───┐  ┌──┴───┐
                                         │ Redis │  │Angel  │  │ Dhan │
                                         │ Cache │  │One API│  │(Bkup)│
                                         └───────┘  └───────┘  └──────┘
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| F1 | Buy |
| F2 | Sell |
| F3 | Reverse Position |
| F4 | Exit Position |
| Ctrl+K | Search Instruments |
| Ctrl+B | Basket Order |

## Market Segments Supported

- **Equity**: NSE + BSE stocks
- **Index Futures**: NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX
- **Stock Futures**: All F&O stocks
- **Index Options**: Weekly + Monthly expiries
- **Stock Options**: Monthly expiries
- **MCX Commodities**: Gold, Silver, Crude Oil, Natural Gas, Copper, Zinc, Aluminium
- **Currency Derivatives**: USDINR, EURINR, GBPINR, JPYINR
"# Terminal" 
