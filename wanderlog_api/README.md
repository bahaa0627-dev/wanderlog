# Wanderlog API

Backend API for Wanderlog travel planning application.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Redis (for caching)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Set up database:
```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate
```

4. Start development server:
```bash
npm run dev
```

## 📁 Project Structure

```
src/
├── controllers/     # Route controllers
├── services/       # Business logic
├── models/         # Data models (Prisma)
├── middleware/     # Express middleware
├── utils/          # Utility functions
└── config/         # Configuration files
```

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **ORM**: Prisma
- **Database**: PostgreSQL
- **Cache**: Redis
- **Authentication**: JWT
- **Payment**: Stripe
- **Maps**: Google Maps API

## 📝 Environment Variables

Create a `.env` file with:

- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `JWT_SECRET`: JWT secret key
- `GOOGLE_CLIENT_ID`: Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret
- `STRIPE_SECRET_KEY`: Stripe secret key
- `MAPBOX_ACCESS_TOKEN`: Mapbox access token
- `OPENAI_API_KEY` / `GEMINI_API_KEY`: AI service API keys

## 🧪 Testing

```bash
npm test
```

## 📄 License

[Your License Here]




