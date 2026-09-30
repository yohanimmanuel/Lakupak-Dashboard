# Lakupak

## Overview
Lakupak is an AI-native commercial platform built to modernize Indonesia's B2B FMCG distribution, starting from the problem that costs distributors the most: sales execution.

At its core, Lakupak is a vertical SaaS system of record for distributors. Retailer relationships, the product catalog, and order history live in one private, secure environment. Per-retailer pricing and discount terms are modeled explicitly, because no two retailers buy on the same terms.

On top of that data, Lakupak's AI layer is a sales copilot for the distributor's own team. It surfaces which retailers are overdue for a reorder, flags drop-offs in usual volume, and recommends the right basket and price for each account. That replaces salespeople queuing at shops, pitching blind, and often leaving before they are heard. This is decision support for the distributor's sales force, not a retailer-facing chatbot.

A marketplace layer connects verified retailers, small shops, kiosks, and warungs to approved distributors for direct ordering, without cross-distributor price comparison. It protects distributor pricing and gives retailers a reliable, always-open channel to order from suppliers they already trust. This layer comes after the SaaS core is proven, because its value depends on distributors already running real operations, and real data, on the platform.

Logistics and fleet visibility are delivered by integrating with existing providers, not by building a fleet. Lakupak stays on sales intelligence and transaction infrastructure, not physical delivery infrastructure. Marketing and lightweight automation are one function: the channel that carries the AI's sales recommendations to the distributor's team and, over time, to their retailers.

Replacing spreadsheets, WhatsApp order-taking, and manual sales rounds with one AI-assisted system is meant to improve sales outcomes, not only to digitize the trade. Distributors close more of the demand that is already there. Retailers get faster, more consistent service. Both sides run on a system built for how FMCG trade actually works in Indonesia, not a generic e-commerce template fitted onto it.

## Key Security & Trust Principles
- **Private system of record**: Each distributor's retailers, catalog, orders, prices, and discounts stay in their own environment. Competitors cannot see that data.
- **Explicit commercial terms**: Prices and discounts are set per retailer. They are not a shared rate card.
- **No cross-distributor price comparison**: A retailer orders from approved distributors they already trust. The marketplace does not line up competing distributors' prices for the same product.
- **Sales copilot, not a retailer chatbot**: AI recommendations are for the distributor's own sales team. They are not an automated pitch sent at the shop.
- **Confirmed buyer identity**: A prospect and a marketplace account stay separate until someone confirms they are the same buyer. Automatic matching stays off until the distributor turns it on. Undoing a merge restores the original prospect.
- **Verified network**: Retailers and distributors are verified before they transact.

## Why Lakupak is Different
Indonesia's FMCG trade still runs on shop visits, WhatsApp orders, and spreadsheets. Lakupak starts with sales execution, then keeps the rest of the commercial relationship on the same record:
- **Sales execution first**: The worklist tells a rep who to visit, what to do, and what to offer, instead of a blind pitch at the shutter.
- **One record, per-retailer terms**: Catalog, orders, and each shop's own price and discount live together. Two retailers do not have to buy on the same terms.
- **Copilot for the distributor's team**: Overdue reorders, volume drop-offs, and a recommended basket are decision support for the sales force.
- **Marketplace without a price war**: Retailers order from suppliers they already trust. They do not compare distributor prices side by side. Buying from another distributor is a choice, not a comparison action. 
- **Logistics by integration**: Shipment visibility uses existing providers. Lakupak does not operate the fleet.
- **One commercial channel**: Marketing and lightweight automation carry the same recommendations to the team, and later to retailers, instead of sitting as separate general-purpose tools.

## Core Features

### Distributor Dashboard
- **System of record**: Retailers, suppliers, product catalog, stock, and order history in one private dashboard.
- **Per-retailer offers**: Discounts, promotions, and volume terms set for a specific buyer, not one price for every shop.
- **Orders**: Track, fulfill, and review orders, with shipment locations shown on a map through provider data.
- **Sales jobs**: A rep worklist for taking an order, collecting payment, promoting a product, checking stock, prospecting a new outlet, picking up a return, checking a competitor, activating a new product, or reconciling a scheme. Jobs move through pending, dispatched, in progress, completed, and skipped. AI can suggest the next jobs. WhatsApp is how those jobs reach the rep.
- **Buyer matching**: Review a prospect against a marketplace order before they become one account, and undo a merge if it was wrong.
- **Analytics**: Sales trends, inventory, and customer behavior from the distributor's own orders.
- **Marketing and automation**: One function for getting sales recommendations to the team and, over time, to retailers.

### Buyer Interface
The buyer interface is the marketplace, used by verified small shops, kiosks, and warungs. It is an ordering channel, not a chatbot.
- **Order from approved distributors** the retailer already trusts
- **No cross-distributor price comparison**
- **Carton and single-piece ordering**, including a first small order to try a product
- **Order tracking**
- **Repeat purchase** from prior orders
- **Always open**, so a shop can order without waiting for a sales visit

## Business Model
- **SaaS subscription**: The core product. Distributors pay to run retailer relationships, catalog, orders, per-retailer terms, and the sales copilot.
- **Commission fee**: 0.25% to 0.5% on marketplace transactions, Gross Merchandise Value (GMV).
- **Marketplace**: A transaction layer for verified retailers and approved distributors. It turns on once distributors are already operating, with real data, on Lakupak.
- **Partner services, not owned infrastructure**: Logistics, fleet visibility, payments, and financing connect through existing providers. They are not a Lakupak-built delivery or lending business.

## Technical Architecture
- Frontend Distributor SaaS Dashboard (Next.js React)
- Mobile App Buyer Marketplace (React Native Expo)
- Backend / APIs (Node.js, GraphQL, REST API)
- Database (Supabase PostgreSQL)
- Real-Time Communication, Notifications (WebSockets, Firebase) 
- Authentication & Authorization (Supabase Auth)
- Messaging & Sales Integration (WhatsApp Business API)
- Infrastructure (Cloud-hosted Supabase + server hosting)
- CI/CD (Docker)
- Security, Audit and Compliance (Redis, Axiom)

## Target Market
- **Distributors**: FMCG distributors serving Indonesia's retail network
- **Buyers**: Small shops, kiosks, warungs, and neighborhood stores
- **Geographic Focus**: Indonesia, with emphasis on both urban and rural communities

## Future Roadmap
- Embedded logistics and delivery tracking
- Digital payment integration
- Working capital financing solutions
- Advanced analytics and AI-powered insights
- Multi-language support for regional markets

## Run with Docker

You can run the Lakupak dashboard with **only Docker** (no Node.js or npm required on your machine).

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running.

1. **Clone the repo** and `cd` into the project (e.g. `Lakupak-Dashboard`).
2. **Create a `.env` file** in the project root with your config (database, Redis, NextAuth, etc.). Use `env.example` as a reference. The app needs at least `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, and `AUTH_SECRET`.
3. **Build and start:**
   ```bash
   docker compose up --build
   ```
   First run will build the app inside Docker (a few minutes). Later runs reuse the image and start quickly.
4. Open **http://localhost:3000** in your browser.

**Optional:**
- **Local Redis** (instead of Redis Cloud): run `docker compose --profile local up --build` and set `REDIS_URL=redis://redis:6379` in `.env`.
- **Local Postgres** (instead of Supabase): run `docker compose --profile local-db up --build` and set `DATABASE_URL` / `DIRECT_URL` to point at the Postgres container.


## Getting Started
[Development setup instructions will be added here]

## Contributing
[Contribution guidelines will be added here]

## License
MIT License
