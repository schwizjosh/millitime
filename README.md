# Crypto Signals Bot

A full-stack cryptocurrency monitoring and trading signals bot built with React, TypeScript, Fastify, and PostgreSQL. The bot monitors selected cryptocurrencies using the CoinGecko API and generates buy/sell/hold signals based on technical analysis.

## Tech Stack

### Frontend
- React 18
- TypeScript
- Vite
- React Router
- Axios
- Custom CSS

### Backend
- Fastify
- TypeScript
- PostgreSQL
- @fastify/cors
- @fastify/postgres
- JWT Authentication
- bcrypt for password hashing
- Axios for CoinGecko API
- node-cron for scheduled signal generation

### Database
- PostgreSQL 16
- Tables: users, watchlist, price_history, signals

### External APIs
- CoinGecko Free API (30 calls/min, 10,000/month)

## Project Structure

```
millitime/
├── frontend/          # React + TypeScript + Vite
├── backend/           # Fastify + TypeScript API
├── database/          # PostgreSQL schemas and migrations
├── docs/              # Documentation
└── docker-compose.yml # Docker configuration
```

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 16+ (or Docker)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/millitime.git
cd millitime
```

2. Install dependencies:
```bash
# Frontend
cd frontend
npm install

# Backend
cd ../backend
npm install
```

3. Setup database:
```bash
# Option 1: Using Docker
docker-compose up -d postgres

# Option 2: Local PostgreSQL
# See database/README.md for setup instructions
```

4. Configure environment variables:
```bash
# Backend
cp backend/.env.example backend/.env
# Edit backend/.env with your database credentials and JWT secret

# Frontend
cp frontend/.env.example frontend/.env
# Edit if you're using a different API URL
```

5. Run database migrations:
```bash
# If using local PostgreSQL
psql -U postgres -d millitime -f database/schema.sql

# If using Docker
docker exec -i millitime_postgres psql -U postgres -d millitime < database/schema.sql
```

### Development

Run all services with Docker:
```bash
docker-compose up
```

Or run services individually:

```bash
# Frontend (in frontend directory)
npm run dev

# Backend (in backend directory)
npm run dev
```

### Access the Application

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Health Check: http://localhost:3000/health

## Features

### User Authentication
- User registration with email and username
- Secure login with JWT tokens
- Password hashing with bcrypt

### Cryptocurrency Watchlist
- Search and add coins from CoinGecko's database
- Monitor multiple cryptocurrencies simultaneously
- Toggle monitoring on/off for individual coins
- Remove coins from watchlist

### Real-Time Price Monitoring
- Automatic price updates every minute
- Display current price, 24h change, and volume
- Price history tracking in database

### Trading Signals
- Automated signal generation every 5 minutes
- Buy/Sell/Hold signals based on technical analysis
- Signal strength indicators (Strong/Moderate/Weak)
- RSI (Relative Strength Index) calculation
- Price change percentage analysis
- Unread signal notifications

### Dashboard Interface
- Clean, modern UI with gradient design
- Tabbed interface for Watchlist and Signals
- Real-time price display with color-coded changes
- Signal cards with type, strength, and details
- Search functionality for adding coins

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Watchlist
- `GET /api/watchlist` - Get user's watchlist
- `POST /api/watchlist` - Add coin to watchlist
- `DELETE /api/watchlist/:id` - Remove coin from watchlist
- `PATCH /api/watchlist/:id` - Toggle coin monitoring
- `GET /api/watchlist/prices` - Get current prices for watchlist

### Coins
- `GET /api/coins/search` - Search for coins (supports query parameter)

### Signals
- `GET /api/signals` - Get user's signals (supports limit/offset)
- `GET /api/signals/unread` - Get unread signals count
- `PATCH /api/signals/:id/read` - Mark signal as read
- `POST /api/signals/read-all` - Mark all signals as read
- `GET /api/signals/coin/:coinId` - Get signals for specific coin

### System
- `GET /health` - Health check
- `GET /api/hello` - API welcome message
- `GET /api/test-db` - Test database connection

## How to Use

1. **Register/Login**: Create an account or login at `http://localhost:5173`

2. **Add Coins to Watchlist**:
   - Use the search bar to find cryptocurrencies
   - Click "Add" to add them to your watchlist
   - Popular coins: bitcoin, ethereum, cardano, solana, etc.

3. **Activate Monitoring**:
   - Coins are automatically set to "Monitoring" when added
   - Toggle monitoring on/off for individual coins
   - Only active coins generate signals

4. **View Signals**:
   - Switch to the "Signals" tab
   - View buy/sell/hold recommendations
   - Click on unread signals to mark them as read
   - Signals include price, RSI, and reasoning

5. **Signal Generation**:
   - Bot runs automatically every 5 minutes
   - Analyzes price movements and technical indicators
   - Generates signals based on:
     - RSI (Relative Strength Index)
     - 24-hour price change percentage
     - Historical price patterns

## Signal Logic

### Buy Signals
- **Strong Buy**: Price down >10% AND RSI <30 (oversold)
- **Moderate Buy**: Price down >5% AND RSI <40
- **Weak Buy**: Price down >3%

### Sell Signals
- **Strong Sell**: Price up >15% AND RSI >70 (overbought)
- **Moderate Sell**: Price up >8% AND RSI >60

### Hold Signals
- High volatility alert when price changes >10%

## Database Schema

### users
- id, email, username, password_hash, created_at, updated_at

### watchlist
- id, user_id, coin_id, coin_symbol, coin_name, is_active, created_at, updated_at

### price_history
- id, coin_id, price, market_cap, volume_24h, price_change_24h, price_change_percentage_24h, timestamp

### signals
- id, user_id, coin_id, coin_symbol, signal_type, price, strength, indicators (JSONB), message, is_read, created_at

## Future Enhancements

- Email/SMS notifications for signals
- More advanced technical indicators (MACD, Bollinger Bands)
- Portfolio tracking
- Price alerts
- Historical signal performance tracking
- Multi-timeframe analysis
- WebSocket for real-time updates
- Mobile app

## License

ISC
