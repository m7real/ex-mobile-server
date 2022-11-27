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

  jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
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
    // todo: add verifyJWT
    app.get("/products", async (req, res) => {
      const category_id = req.query.category;
      const query = {
        category_id: category_id,
      };
      const products = await productsCollection.find(query).toArray();
      res.send(products);
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

    // checks user role for seller
    app.get("/users/seller/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send({ isSeller: user?.role === "seller" });
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
