import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import axios from "axios";

import env from "dotenv";
env.config();

const app = express();
const port = 3000;

// Database configuration for connecting to PostgreSQL
const dbConfig = {
  user: process.env.USER,
  host: process.env.HOST,
  database: process.env.DATABASE,
  password: process.env.PASSWORD,
  port: 5432,
  ssl: {
    rejectUnauthorized: false,
  },
};

let errors = [];
let isSearching = false;

// Connect to PostgreSQL database
const db = new pg.Client(dbConfig);
db.connect();

app.set("view engine", "ejs");

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// Function to fetch movies from the database
async function getMovies() {
  try {
    const result = await db.query("SELECT * FROM movies ORDER BY rating DESC");
    return result.rows;
  } catch (err) {
    console.error("Error getting movies:", err);
    return [];
  }
}

// Display all movies
app.get("/", async (req, res) => {
  errors = [];
  isSearching = false;

  try {
    const movies = await getMovies();
    res.render("index.ejs", {
      movies,
      isSearching,
    });
  } catch (err) {
    console.error("Error getting movies:", err);
  }
});

// Render page for adding a movie
app.get("/add", async (req, res) => {
  res.render("addMovie.ejs", {
    errors,
  });
});

// Add a new movie
app.post("/add", rateLimitMiddleware, async (req, res) => {
  const movieName = req.body.movieName;
  const rating = req.body.rating;
  const apiKey = process.env.API_KEY;

  try {
    const response = await axios.get(
      `http://www.omdbapi.com/?apikey=${apiKey}&t=${encodeURIComponent(movieName)}`,
    );
    console.log(response.rows);
    const data = response.data;
    await db.query(
      "INSERT INTO movies(title, description, rating, poster_src) VALUES ($1, $2, $3, $4)",
      [data.Title, data.Plot, rating, data.Poster],
    );
    res.redirect("/");
  } catch (err) {
    console.error("Error getting movies:", err);

    errors = [];

    // Check if the movie already exists
    if (err.routine === "_bt_check_unique") {
      errors.push("Movie is already listed");
    } else {
      errors.push("Movie not found");
    }

    if (
      err.constraint === "check_value" ||
      err.routine == "float8in_internal_opt_error"
    ) {
      errors.push("Rating should be number between 0 and 10");
    }

    res.redirect("/add");
  }
});

// Delete a movie
app.post("/delete/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM movies WHERE id=$1", [req.params.id]);
  } catch (err) {
    console.error("Error getting movies:", err);
  }
  res.redirect("/");
});

// Redirect to IMDB page
app.get("/movie/:id", async (req, res) => {
  try {
    const result = await db.query("SELECT title FROM movies WHERE id=$1", [
      req.params.id,
    ]);
    const movieName = result.rows[0].title; // Extract movie title
    res.redirect(
      `https://www.imdb.com/find?q=${encodeURIComponent(movieName)}`,
    );
  } catch (err) {
    console.error("Error getting movies:", err);
  }
});

// Edit movie rating
app.get("/edit/:id", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT title, rating FROM movies WHERE id=$1",
      [req.params.id],
    );
    const movieTitle = result.rows[0].title;
    const movieRating = result.rows[0].rating;

    res.render("editRating.ejs", {
      movieId: req.params.id,
      movieTitle,
      movieRating,
      errors,
    });
  } catch (err) {
    console.log(err);
  }
});

// Update movie rating
app.post("/edit/:id", async (req, res) => {
  const editedRating = req.body.editedRating;
  const movieId = req.params.id;
  errors = [];

  try {
    await db.query("UPDATE movies SET rating=$1 WHERE id=$2", [
      editedRating,
      movieId,
    ]);
    res.redirect("/");
  } catch (err) {
    console.error("Error editing rating:", err);
    if (
      err.constraint === "check_value" ||
      err.routine == "float8in_internal_opt_error"
    ) {
      errors.push("Rating should be number between 0 and 10");
    }
    res.redirect(`/edit/${movieId}`);
  }
});

// Search for movies
app.get("/search", async (req, res) => {
  const search = String(req.query.search).trim().toLowerCase();

  try {
    const result = await db.query(
      "SELECT * FROM movies WHERE LOWER(title) LIKE $1",
      ["%" + search + "%"],
    );
    const filteredMovies = result.rows;

    isSearching = true;

    res.render("index.ejs", {
      movies: filteredMovies,
      search,
    });
  } catch (err) {
    console.error("Error searching movies:", err);
    res.redirect("/");
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Rate limiting middleware
const requestCounts = {};

function rateLimitMiddleware(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // Time window for rate limiting
  const maxRequests = 50; // Maximum allowed requests per time window

  if (!requestCounts[ip]) {
    requestCounts[ip] = [];
  }

  requestCounts[ip] = requestCounts[ip].filter((timestamp) => {
    return timestamp > now - windowMs;
  });

  if (requestCounts[ip].length >= maxRequests) {
    return res
      .status(429)
      .send("Too many movies added from this IP, please try again later");
  }

  requestCounts[ip].push(now);

  next();
}
