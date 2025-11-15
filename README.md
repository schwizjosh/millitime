# Millitime

A full-stack application built with React, TypeScript, Fastify, and PostgreSQL.

## Tech Stack

### Frontend
- React 18
- TypeScript
- Vite
- CSS/Styling TBD

### Backend
- Fastify
- TypeScript
- PostgreSQL
- @fastify/cors
- @fastify/postgres

### Database
- PostgreSQL 16

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
# Edit backend/.env with your database credentials
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

## API Endpoints

- `GET /health` - Health check
- `GET /api/hello` - Hello world
- `GET /api/test-db` - Test database connection

## License

ISC
