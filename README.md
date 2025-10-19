# Sync Backend

[![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![StarkNet](https://img.shields.io/badge/StarkNet-0052FF?style=flat&logo=starknet&logoColor=white)](https://starknet.io/)
[![Prisma](https://img.shields.io/badge/Prisma-3982CE?style=flat&logo=Prisma&logoColor=white)](https://prisma.io/)

## Overview

Sync Backend is a decentralized payment system built on the StarkNet ecosystem, enabling instant fiat-to-crypto transactions for seamless everyday spending. The system bridges traditional financial systems with decentralized finance (DeFi), allowing users to transact in their local fiat currencies while leveraging cryptocurrency liquidity for instant settlements.

This project introduces a hybrid payment protocol with:
- **Local Currency Wallet** (e.g., Naira, USD, EUR) for fiat-based transactions.
- **Crypto Wallet** (StarkNet-based assets like STRK, ETH, BTC, or stablecoins).
- **Automated Liquidity Bridging** for seamless fallback to crypto when fiat balances are insufficient.

## Problem Statement

Current fiat-to-crypto payment solutions face challenges such as:
- Lack of instant conversion between fiat and crypto.
- High fees and delays associated with centralized exchanges.
- Complex user experience, making blockchain-based payments inaccessible to everyday users.

## Solution Overview

The system enables users to make instant payments using fiat, while leveraging a crypto-backed reserve to ensure seamless transactions.

### Key Components

1. **Local Currency Wallet**
   - Stores users' fiat balances.
   - Supports deposits via bank transfer or on-ramp solutions.
   - Used for direct payments where sufficient funds are available.

2. **Crypto Wallet (StarkNet-based)**
   - Stores cryptocurrency assets (STRK, ETH, USDC, etc.).
   - Acts as a reserve to top-up the Local Currency Wallet when needed.
   - Enables decentralized transactions and staking opportunities.

3. **Automated P2P Liquidity Bridge**
   - If the Local Currency Wallet lacks sufficient funds, the system automatically sources liquidity from the Crypto Wallet.
   - Converts crypto to fiat via on-chain and off-chain liquidity pools.
   - Facilitates instant swaps between fiat and crypto at competitive rates.

4. **Merchant Integration**
   - Businesses can receive payments in either fiat or crypto.
   - Merchants choose settlement preference (fiat or stablecoins).
   - Instant finality powered by StarkNet's high-speed rollups.

## Technical Architecture

### Layered Payment Processing

The system operates across three layers:
1. **User Wallet Layer**: Manages fiat and crypto balances.
2. **Liquidity & Settlement Layer**: Executes instant fiat-to-crypto swaps.
3. **Blockchain Execution Layer**: Processes transactions on StarkNet, leveraging its low-cost rollups.

### Smart Contract Implementation
- StarkNet Smart Contracts handle payments, swaps, and liquidity management.
- Automated funding contracts trigger when fiat funds are insufficient.
- Liquidity pool contracts match fiat requests with available crypto reserves.

### Payment Flow Example
1. User scans merchant QR code and initiates a ₦5000 payment.
2. System checks Local Currency Wallet balance:
   - If sufficient: Direct payment occurs.
   - If insufficient: The Crypto Wallet is debited, and crypto is swapped for fiat.
3. Merchant receives payment instantly in fiat or stablecoin.

## Tech Stack

- **Framework**: NestJS (Node.js)
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Blockchain**: StarkNet (Cairo contracts)
- **Authentication**: JWT with Passport
- **Payment Integrations**: Monnify, Flutterwave
- **Deployment**: Docker, optimized for production

## Features

- **Instant Fiat-to-Crypto Transactions**: Seamless conversion and settlement.
- **Non-Custodial Design**: Users retain full control of their assets.
- **Multi-Currency Support**: Local fiat and various cryptocurrencies.
- **Merchant Integration**: QR code payments and instant settlements.
- **Automated Liquidity Management**: P2P bridging for fund shortages.
- **Security**: Encrypted wallets, audit logging, and compliance features.
- **API Documentation**: Swagger/OpenAPI integration.

## Installation

### Prerequisites

- Node.js (v22 or higher)
- PostgreSQL database
- pnpm package manager

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd sync-backend
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Environment Configuration**

   Copy the example environment file and update with your configurations:
   ```bash
   cp .env.example .env
   ```

   Update the following key variables in `.env`:
   ```env
   NODE_ENV=development
   PORT=5000
   DATABASE_URL=postgresql://username:password@localhost:5432/database_name

   # StarkNet Configuration
   STARKNET_NODE_URL_8=your_starknet_node_url
   DEPLOYER_PRIVATE_KEY=your_deployer_private_key
   DEPLOYER_ADDRESS=your_deployer_address

   # Payment Integrations
   MONNIFY_API_KEY=your_monnify_api_key
   MONNIFY_SECRET_KEY=your_monnify_secret_key
   FLUTTERWAVE_SECRET_KEY=your_flutterwave_secret_key

   # Security
   JWT_SECRET=your_jwt_secret
   WALLET_ENCRYPTION_KEY=your_secure_encryption_key
   ```

4. **Database Setup**

   Ensure PostgreSQL is running and update `DATABASE_URL` in `.env`. Then generate Prisma client and run migrations:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Build the Application**
   ```bash
   pnpm run build
   ```

## Usage

### Development Mode

Run the application in development mode with hot-reload:
```bash
pnpm run start:dev
```

The API will be available at `http://localhost:5000` with Swagger documentation at `http://localhost:5000/api`.

### Production Mode

For production deployment:
```bash
pnpm run start:prod
```

### Docker Deployment

Build and run using Docker:
```bash
docker build -t sync-backend .
docker run -p 5000:5000 --env-file .env sync-backend
```

## API Documentation

The API is documented using Swagger/OpenAPI. Access the interactive documentation at `/api` when the server is running.

Key endpoints include:
- **Authentication**: User registration, login, and JWT management.
- **Wallets**: Fiat and crypto wallet operations.
- **Payments**: Transaction processing and merchant integrations.
- **Liquidity**: Automated bridging and swap operations.

## Development

### Available Scripts

- `pnpm run start` - Start the application
- `pnpm run start:dev` - Start in development mode
- `pnpm run start:debug` - Start with debugging
- `pnpm run build` - Build the application
- `pnpm run test` - Run unit tests
- `pnpm run test:e2e` - Run end-to-end tests
- `pnpm run lint` - Lint the codebase
- `pnpm run format` - Format code with Prettier

### Project Structure

```
src/
├── auth/           # Authentication module
├── contract/       # StarkNet contract interactions
├── liquidity/      # Liquidity management
├── payment/        # Payment processing
├── user/          # User management
├── wallet/        # Wallet operations
└── ...
```

## Security & Compliance

- **Non-Custodial Design**: Users retain full control of their crypto and fiat assets.
- **KYC/AML Compliance**: Local currency on-ramps follow regulatory standards.
- **Zero-Knowledge Proofs (ZKPs)**: Ensures transaction privacy without compromising security.
- **Audit Logging**: Comprehensive logging for all key operations and security events.

## Contributing

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-feature`.
3. Commit changes: `git commit -m 'Add some feature'`.
4. Push to the branch: `git push origin feature/your-feature`.
5. Open a pull request.

Please ensure code follows the project's linting and formatting standards.

## License

This project is licensed under the UNLICENSED License.

## Support

For questions, issues, or contributions, please contact the development team or open an issue in the repository.
