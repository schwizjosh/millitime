# Database Setup

## PostgreSQL Setup

### 1. Install PostgreSQL (if not already installed)

```bash
# Ubuntu/Debian
sudo apt-get install postgresql postgresql-contrib

# macOS with Homebrew
brew install postgresql
```

### 2. Create Database

```bash
# Access PostgreSQL
sudo -u postgres psql

# Create database
CREATE DATABASE millitime;

# Create user (optional)
CREATE USER millitime_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE millitime TO millitime_user;
```

### 3. Run Schema

```bash
# From the database directory
psql -U postgres -d millitime -f schema.sql
```

## Environment Variables

Update your backend `.env` file with your database credentials:

```
DATABASE_URL=postgres://postgres:password@localhost:5432/millitime
```

## Migrations

Migration files are stored in `./migrations/` directory.

## Seeds

Seed data files are stored in `./seeds/` directory.
