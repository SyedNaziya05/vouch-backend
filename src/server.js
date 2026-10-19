require("dotenv").config();

const express = require("express");
const pool = require("./db");
const authRoutes = require("./auth");
const assignmentRoutes = require("./assignments");
const attemptRouter= require("./attempts");
const attemptRoutes = require("./attempts");

const app = express();

app.use(express.json({ limit: "100kb" }));

app.get("/health", async (req, res) => {
    try {
        await pool.query("SELECT 1");

        res.json({
            status: "ok",
            database: "connected"
        });
    } catch (error) {
        res.status(503).json({
            status: "error",
            database: "disconnected"
        });
    }
});

app.use("/api/auth", authRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/attempts", attemptRouter);
app.use("/api/attempts", attemptRoutes);

const PORT = Number(process.env.PORT || 3000);

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

module.exports = app;