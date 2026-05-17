---
title: Browse and search
description: Home, categories, Meilisearch, filters, and product detail.
section: Marketplace
module: marketplace
order: 32
---

Discover distributor catalogs from **Home**, **Categories**, and **Search**, then open product detail to add items or buy now.

## Home tab

Path: `/(tabs)/home`.

Header shows your **store name** (or **My Store**) and delivery address (**Set your address** if empty).

Tap **Search for products…** to open full search.

### Home sections

| Section | Behavior |
|---------|----------|
| **Special Offers** | Carousel; **See All** → offers list; tap banner → offer detail |
| **Categories** | Category chips → search with category filter |
| **Featured Products** | Product grid → `/product?productId=…` |

Empty catalog: **No products available**. End of list: **Products displays reached the end.**

## Categories tab

Path: `/(tabs)/categories`.

- **Explore by Category**
- **New This Week** with **See all** → search
- Product grid same as Home

Requires login like Home.

## Search

Path: `/search`.

### Sort and filters

**Sort:** Relevance, Latest, Top Sales, Price.

**Filter sheet** sections:

- Shipped From
- Shipping Option (**Self Collection**, **Doorstep Delivery**, **Buyer Courier**)
- Sales Channel (**Retail**, **Wholesale**)
- Shop Rating
- Price Range
- Category

Actions: **Reset**, **Apply**.

### Discovery blocks

When not searching: **Recent Searches**, **Suggestions**, **Popular Categories**, **Top Brands**, **Top Distributors**.

**No results found** with **Try adjusting your search or filters**.

Search uses fast catalog indexing so buyers can find products by name, category, and filters quickly.

## Product detail

Path: `/product?productId=…` (component: `ProductMarketplace`).

### Product actions

| Action | Purpose |
|--------|---------|
| **Chat Now** | Open WhatsApp chat with distributor |
| **Add to Cart** | Add with quantity and variant |
| **Buy Now** | Fast checkout modal |

**Buy Now** modal: **Quantity**, **Minimum order: X pieces**, **Total**, **Buy Now**, **Add to Cart**.

### Product information

Sections and badges:

- **Description**, **Customer Reviews**, **Product Assurance**
- **Seller Information**, **Preferred**, **BEST SELLER**, **OFFICIAL STORE**
- Stock: **In Stock**, **Low Stock**, **Out of Stock**
- **You may also like**, **Product Details** (Brand, Type, Category)

Reviews: **Reviews** list screen.

## Related documentation

- [Cart and checkout](/en/docs/marketplace/cart-checkout)
- [Offers and following](/en/docs/marketplace/offers-following)
- [Messages](/en/docs/marketplace/account-settings) via Settings and product **Chat Now**
