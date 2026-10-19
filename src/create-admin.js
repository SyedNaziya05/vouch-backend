require("dotenv").config();

const bcrypt = require("bcryptjs");
const pool = require("./db");
const readline = require("readline/promises");
const { stdin, stdout } = require("process");

async function main() {
    const rl = readline.createInterface({ input: stdin, output: stdout });

    try {
        const email = (
            await rl.question("Administrator email: ")
        ).trim().toLowerCase();

        const name = (
            await rl.question("Administrator name: ")
        ).trim();

        const password = await rl.question(
            "Administrator password (minimum 12 characters): "
        );

        if (
            !email ||
            !name ||
            password.length < 12 ||
            password.length > 72
        ) {
            throw new Error("Invalid input or password length");
        }

        const existing = await pool.query(
            "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
        );

        if (existing.rows.length) {
            throw new Error(
                "An administrator already exists. Setup is disabled."
            );
        }

        const passwordHash = await bcrypt.hash(password, 12);

        await pool.query(
            `INSERT INTO users (name, email, password_hash, role)
             VALUES ($1, $2, $3, 'admin')`,
            [name, email, passwordHash]
        );

        console.log("Administrator created successfully.");
    } finally {
        rl.close();
        await pool.end();
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});