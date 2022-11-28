const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const port = process.env.PORT || 5000;

const app = express();

// middleware
app.use(cors());
app.use(express.json());

// mongodb
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wo3xvdt.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// middleware to verify JWT Token
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      console.log(err);
      return res.status(403).send({ message: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    const categoriesCollection = client.db("exMobile").collection("categories");
    const usersCollection = client.db("exMobile").collection("users");
    const productsCollection = client.db("exMobile").collection("products");

    // middleware to verify Admin
    // !NOTE: make sure you use verifyAdmin only after verifyJWT
    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);

      if (user?.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // middleware to verify Seller
    // !NOTE: make sure you use verifySeller only after verifyJWT
    const verifySeller = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);

      if (user?.role !== "seller") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // api to get categories
    app.get("/categories", async (req, res) => {
      const query = {};
      const categories = await categoriesCollection.find(query).toArray();
      res.send(categories);
    });

    // api to get products by category id
    app.get("/products", verifyJWT, async (req, res) => {
      let query = {};
      const categoryId = req.query.category;
      const reportedProducts = req.query.reported;
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      if (categoryId) {
        query = {
          categoryId: categoryId,
          status: "available",
        };
      }
      if (reportedProducts) {
        query = {
          reported: true,
        };
      }
      if (email) {
        if (email !== decodedEmail) {
          return res.status(403).send({ message: "forbidden access" });
        }
        query = {
          sellerEmail: email,
        };
      }
      const products = await productsCollection.find(query).toArray();

      // processing the used years of every product
      if (products.length > 0) {
        products.forEach((product) => {
          product.usedYears = new Date().getFullYear() - product.purchasedYear;
        });
      }

      res.send(products);
    });

    // api to post new product
    app.post("/products", verifyJWT, verifySeller, async (req, res) => {
      const product = req.body;
      product.posted = new Date().getTime();
      const result = await productsCollection.insertOne(product);
      res.send(result);
    });

    // api to update a product
    app.put("/products/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const product = req.body.product;
      // this info helps to conditionally serve all product update requests with one API
      const info = req.body.info;
      const decodedEmail = req.decoded.email;

      let filter = {
        _id: ObjectId(id),
      };
      const options = { upsert: true };

      let updatedDoc = {};
      if (info === "advertise") {
        // checks for the appropriate seller and also product as we are checking seller email from this product
        if (id !== product._id || decodedEmail !== product.sellerEmail) {
          return res.status(403).send({ message: "forbidden access" });
        }

        updatedDoc = {
          $set: {
            advertised: true,
          },
        };
      }
      if (info === "reported") {
        updatedDoc = {
          $set: {
            reported: true,
          },
        };
      }

      const result = await productsCollection.updateOne(filter, updatedDoc, options);
      res.send(result);
    });

    // api to delete a product
    app.delete("/products/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const decodedEmail = req.decoded.email;
      const filter = {
        _id: ObjectId(id),
      };
      const product = await productsCollection.findOne(filter);
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);

      // checks for the appropriate seller or admin to delete a product
      if (user?.role !== "admin" && decodedEmail !== product.sellerEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const result = await productsCollection.deleteOne(filter);
      res.send(result);
    });

    // issue JWT
    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = {
        email: email,
      };
      const user = await usersCollection.findOne(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "9d" });
        return res.send({ accessToken: token });
      }
      res.status(403).send({ accessToken: "" });
    });

    // checks user role for admin
    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send({ isAdmin: user?.role === "admin" });
    });

    // checks user role for seller & also gives seller info
    app.get("/users/seller/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send({ isSeller: user?.role === "seller", seller: user });
    });

    // get users (sellers or buyers)
    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const userType = req.query.userType;
      let query = {};
      if (userType === "seller") {
        query = {
          role: "seller",
        };
      }
      if (userType === "buyer") {
        query = {
          role: "buyer",
        };
      }
      const users = await usersCollection.find(query).toArray();
      res.send(users);
    });

    // save new user
    app.post("/users", async (req, res) => {
      const user = req.body;
      const email = user.email;
      const query = {
        email: email,
      };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ acknowledged: true });
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });
  } finally {
// prettier-ignore

    }
}

run().catch((err) => console.error(err));

// test api
app.get("/", (req, res) => {
  res.send("Ex Mobile Server is running");
});

app.listen(port, () => console.log(`Ex Mobile running on ${port}`));
