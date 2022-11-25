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

// test api
app.get("/", (req, res) => {
  res.send("Ex Mobile Server is running");
});

app.listen(port, () => console.log(`Ex Mobile running on ${port}`));
