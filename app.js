// app.js

// Load .env ONLY in local development (Render uses Environment Variables)
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();

// Use hosting platform PORT in production, fallback to 3000 locally
const PORT = process.env.PORT || 3000;

// Read MongoDB connection string from environment variables
const MONGO_URI = process.env.MONGO_URI;

// Stop the app early if MONGO_URI is missing
if (!MONGO_URI) {
  console.error(
    "MONGO_URI is missing. Add it to .env locally or set it in your hosting platform environment variables."
  );
  process.exit(1);
}

console.log("MONGO_URI (masked) =", process.env.MONGO_URI?.replace(/\/\/.*?:.*?@/, "//***:***@"));

// Create Mongo client
const client = new MongoClient(MONGO_URI, {
  serverSelectionTimeoutMS: 15000, // fail fast if Mongo is unreachable
});

let productsCollection;
let itemsCollection;

// Middleware: parse JSON bodies
app.use(express.json());

// Middleware: simple request logger
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// GET / (must return JSON)
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Backend API is running",
    endpoints: [
      "GET /",
      "GET /version",

      // Products (Tasks 10-11)
      "GET /api/products",
      "GET /api/products/:id",
      "POST /api/products",
      "PUT /api/products/:id",
      "DELETE /api/products/:id",

      // Items (Task 13)
      "GET /api/items",
      "GET /api/items/:id",
      "POST /api/items",
      "PUT /api/items/:id",
      "PATCH /api/items/:id",
      "DELETE /api/items/:id",
    ],
    examples: [
      "/api/products?category=Electronics",
      "/api/products?minPrice=50&sort=price",
      "/api/products?fields=name,price",
    ],
  });
});

// GET /version (Practice Task 12)
app.get("/version", (req, res) => {
  res.status(200).json({
    version: "1.2",
    updatedAt: "2026-01-26",
  });
});

// ===================== PRODUCTS API (Tasks 10-11) =====================

// GET /api/products (filter + sort + projection)
app.get("/api/products", async (req, res) => {
  try {
    const { category, minPrice, sort, fields } = req.query;

    // 1) FILTER
    const filter = {};
    if (category) filter.category = category;

    if (minPrice !== undefined) {
      const min = Number(minPrice);
      if (Number.isNaN(min)) {
        return res.status(400).json({ error: "minPrice must be a number" });
      }
      filter.price = { $gte: min };
    }

    // 2) PROJECTION
    let projection;
    if (fields) {
      const fieldList = String(fields)
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);

      if (fieldList.length === 0) {
        return res
          .status(400)
          .json({ error: "fields must contain at least one field name" });
      }

      projection = { _id: 0 };
      for (const f of fieldList) projection[f] = 1;
    }

    // 3) SORT (ascending by price if sort=price)
    const sortOption = sort === "price" ? { price: 1 } : undefined;

    // 4) QUERY
    let cursor = productsCollection.find(
      filter,
      projection ? { projection } : undefined
    );

    if (sortOption) cursor = cursor.sort(sortOption);

    const products = await cursor.toArray();

    res.status(200).json({ count: products.length, products });
  } catch (error) {
    console.error("GET /api/products error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/products/:id
app.get("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    const product = await productsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!product) return res.status(404).json({ error: "Product not found" });

    res.status(200).json(product);
  } catch (error) {
    console.error("GET /api/products/:id error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/products
app.post("/api/products", async (req, res) => {
  try {
    const { name, price, category } = req.body;

    if (!name || price === undefined || !category) {
      return res
        .status(400)
        .json({ error: "Missing fields: name, price, category" });
    }

    const priceNumber = Number(price);
    if (Number.isNaN(priceNumber)) {
      return res.status(400).json({ error: "price must be a number" });
    }

    const result = await productsCollection.insertOne({
      name: String(name).trim(),
      price: priceNumber,
      category: String(category).trim(),
      createdAt: new Date(),
    });

    res.status(201).json({ message: "Product created", id: result.insertedId });
  } catch (error) {
    console.error("POST /api/products error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/products/:id (partial-style update)
app.put("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    const { name, price, category } = req.body;

    const update = {};
    if (name !== undefined) update.name = String(name).trim();
    if (category !== undefined) update.category = String(category).trim();

    if (price !== undefined) {
      const priceNumber = Number(price);
      if (Number.isNaN(priceNumber)) {
        return res.status(400).json({ error: "price must be a number" });
      }
      update.price = priceNumber;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    const result = await productsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: update }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.status(200).json({ message: "Product updated" });
  } catch (error) {
    console.error("PUT /api/products/:id error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/products/:id
app.delete("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid product ID" });
    }

    const result = await productsCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.status(200).json({ message: "Product deleted" });
  } catch (error) {
    console.error("DELETE /api/products/:id error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ===================== ITEMS API (Practice Task 13) =====================

// GET /api/items
app.get("/api/items", async (req, res) => {
  try {
    const items = await itemsCollection.find({}).toArray();
    res.status(200).json({ count: items.length, items });
  } catch (error) {
    console.error("GET /api/items error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/items/:id
app.get("/api/items/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid item ID" });
    }

    const item = await itemsCollection.findOne({ _id: new ObjectId(id) });

    if (!item) return res.status(404).json({ error: "Item not found" });

    res.status(200).json(item);
  } catch (error) {
    console.error("GET /api/items/:id error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/items
app.post("/api/items", async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !description) {
      return res
        .status(400)
        .json({ error: "Missing required fields: name, description" });
    }

    const itemDoc = {
      name: String(name).trim(),
      description: String(description).trim(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (!itemDoc.name || !itemDoc.description) {
      return res
        .status(400)
        .json({ error: "name and description cannot be empty" });
    }

    const result = await itemsCollection.insertOne(itemDoc);

    res.status(201).json({ message: "Item created", id: result.insertedId });
  } catch (error) {
    console.error("POST /api/items error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/items/:id (full update)
app.put("/api/items/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid item ID" });
    }

    const { name, description } = req.body;

    if (!name || !description) {
      return res.status(400).json({
        error: "PUT requires full update: name and description are required",
      });
    }

    const updated = {
      name: String(name).trim(),
      description: String(description).trim(),
      updatedAt: new Date(),
    };

    if (!updated.name || !updated.description) {
      return res
        .status(400)
        .json({ error: "name and description cannot be empty" });
    }

    const result = await itemsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updated }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.status(200).json({ message: "Item updated (PUT)" });
  } catch (error) {
    console.error("PUT /api/items/:id error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /api/items/:id (partial update)
app.patch("/api/items/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid item ID" });
    }

    const { name, description } = req.body;

    const update = { updatedAt: new Date() };

    if (name !== undefined) {
      const n = String(name).trim();
      if (!n) return res.status(400).json({ error: "name cannot be empty" });
      update.name = n;
    }

    if (description !== undefined) {
      const d = String(description).trim();
      if (!d)
        return res.status(400).json({ error: "description cannot be empty" });
      update.description = d;
    }

    if (Object.keys(update).length === 1) {
      return res.status(400).json({
        error: "PATCH requires at least one field: name or description",
      });
    }

    const result = await itemsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: update }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.status(200).json({ message: "Item updated (PATCH)" });
  } catch (error) {
    console.error("PATCH /api/items/:id error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /api/items/:id
app.delete("/api/items/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid item ID" });
    }

    const result = await itemsCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    // 204 No Content
    res.status(204).send();
  } catch (error) {
    console.error("DELETE /api/items/:id error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 404 handler (must return JSON)
app.use((req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});

// Connect to MongoDB and start server
async function startServer() {
  try {
    await client.connect();

    const dbName = "shop";
    const db = client.db(dbName);

    productsCollection = db.collection("products");
    itemsCollection = db.collection("items");

    console.log(
      `Connected to MongoDB. Database "${dbName}" ready. Collections: products, items.`
    );

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
}

startServer();
