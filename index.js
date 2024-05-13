import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import axios from "axios";

const app = express();
const port = 3000;

const dbConfig = {
  user: "postgres",
  host: "localhost",
  database: "movie_library",
  password: "Masina1Masina123!",
  port: 5432,
};

let errors = [];
let isSearching = false;

const db = new pg.Client(dbConfig);
db.connect();

app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

async function getMovies() {
  try {
    const result = await db.query("SELECT * FROM movies ORDER BY rating DESC");
    return result.rows;
  } catch (err) {
    console.error("Error getting movies:", err);
    return [];
  }
}

app.get("/", async (req, res) => {

  errors = [];
  isSearching = false;

  try {
    const movies = await getMovies();
    res.render("index.ejs", {
      movies,
      isSearching
    });
  } catch (err) {
    console.error("Error getting movies:", err);
  }
  });

  app.get("/add", async (req, res) => {
      res.render("addMovie.ejs",{
        errors,
      });
    });

  app.post("/add", rateLimitMiddleware, async (req, res) => {
    const movieName = req.body.movieName;
    const rating = req.body.rating;
    const apiKey = "4c13b6d9";

  try {
    const response = await axios.get(`http://www.omdbapi.com/?apikey=${apiKey}&t=${encodeURIComponent(movieName)}`);
    console.log(response.rows);
    const data = response.data;
    await db.query("INSERT INTO movies(title, description, rating, poster_src) VALUES ($1, $2, $3, $4)", [data.Title, data.Plot, rating, data.Poster]);
    res.redirect("/");
  } catch (err) {
    console.error("Error getting movies:", err);

    errors = [];

    if(err.routine === "_bt_check_unique") {
      errors.push("Movie is already listed"); 
    } else {
      errors.push("Movie not found");
    }

    if(err.constraint === "check_value" || err.routine == "float8in_internal_opt_error") {
      errors.push("Rating should be number between 0 and 10");
    }

    res.redirect("/add");
  }
});

app.get("/add", async (req, res) => {
  res.render("addMovie.ejs");
});

app.post("/delete/:id", async (req, res) => {
  try {
    await db.query("DELETE FROM movies WHERE id=$1", [req.params.id]);
  } catch (err) {
    console.error("Error getting movies:", err);
  }
  res.redirect("/");
});

app.get("/movie/:id", async (req, res) => {
  try {
    const result = await db.query("SELECT title FROM movies WHERE id=$1", [req.params.id]);
    const movieName = result.rows[0].title;
    res.redirect(`https://www.imdb.com/find?q=${encodeURIComponent(movieName)}`);
  } catch (err) {
    console.error("Error getting movies:", err);
  }
});

app.get("/edit/:id", async (req, res) => {
  try {

    const result = await db.query("SELECT title, rating FROM movies WHERE id=$1", [req.params.id]);
    const movieTitle = result.rows[0].title;
    const movieRating = result.rows[0].rating;

    res.render("editRating.ejs", {
      movieId: req.params.id,
      movieTitle,    
      movieRating,
      errors
    });
  } catch (err) {
    console.log(err);
  }
});

app.post("/edit/:id", async (req, res) => {
  
  const editedRating = req.body.editedRating;
  const movieId = req.params.id;
  errors = [];
  
  try {

    await db.query("UPDATE movies SET rating=$1 WHERE id=$2", [editedRating, movieId]);
    res.redirect("/");
    
  } catch (err) {
    console.error("Error editing rating:", err);
    if(err.constraint === "check_value" || err.routine == "float8in_internal_opt_error") {
      errors.push("Rating should be number between 0 and 10");
    }
    console.error("Error editing rating:", err);

    res.redirect(`/edit/${movieId}`);
  }
});

app.get("/search", async (req, res) => {
  
  const search = String(req.query.search).trim().toLowerCase();

  try {

    const result = await db.query("SELECT * FROM movies WHERE LOWER(title) LIKE $1", ['%' + search + '%']);
    const filteredMovies = result.rows;
    
    isSearching = true;

    res.render("index.ejs", {
      movies: filteredMovies,
      search
    });
    
  } catch (err) {
    console.error("Error searching movies:", err);
    res.redirect("/");
  }

});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
  
const requestCounts = {};

function rateLimitMiddleware(req, res, next) {
  const ip = req.ip; 
  const now = Date.now(); 
  const windowMs = 15 * 60 * 1000; 
  const maxRequests = 50;

  if (!requestCounts[ip]) {
    requestCounts[ip] = [];
  }

  requestCounts[ip] = requestCounts[ip].filter((timestamp) => {
    return timestamp > now - windowMs;
  });

  if (requestCounts[ip].length >= maxRequests) {
    return res.status(429).send('Too many movies added from this IP, please try again later');
  }

  requestCounts[ip].push(now);

  next();
}