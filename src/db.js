const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
});

pool.on("error", (error) => {
    console.error("Unexpected database error:", error);
});
pool.query("SELECT current_database() AS database_name")
    .then((result) => {
        console.log("Connected database:", result.rows[0].database_name);
    })
    .catch((error) => {
        console.error("Database check failed:", error.message);
    });
module.exports = pool;