const express = require("express");
const pool = require("./db");

const {
    authenticateToken,
    requireAdmin
} = require("./middleware");

const router = express.Router();

router.post(
    "/",
    authenticateToken,
    requireAdmin,
    async (req, res) => {
        try {
            const {
                title,
                description,
                questions,
                start_time,
                deadline,
                duration_minutes
            } = req.body;

            if (
                typeof title !== "string" ||
                !title.trim() ||
                typeof description !== "string" ||
                !description.trim() ||
                !Array.isArray(questions) ||
                questions.length === 0 ||
                questions.length > 100 ||
                !Number.isInteger(duration_minutes) ||
                duration_minutes < 1 ||
                duration_minutes > 600
            ) {
                return res.status(400).json({
                    error: "Invalid assignment details"
                });
            }

            for (const question of questions) {
                if (
                    typeof question.id !== "string" ||
                    !question.id.trim() ||
                    typeof question.text !== "string" ||
                    !question.text.trim() ||
                    !Array.isArray(question.options) ||
                    question.options.length < 2 ||
                    question.options.length > 6 ||
                    !Number.isInteger(question.correct_option) ||
                    question.correct_option < 0 ||
                    question.correct_option >= question.options.length ||
                    !Number.isInteger(question.marks) ||
                    question.marks < 1 ||
                    question.marks > 100
                ) {
                    return res.status(400).json({
                        error: "Invalid question format"
                    });
                }
            }

            const ids = questions.map((q) => q.id);

            if (new Set(ids).size !== ids.length) {
                return res.status(400).json({
                    error: "Question IDs must be unique"
                });
            }

            const start = start_time ? new Date(start_time) : new Date();
            const end = new Date(deadline);

            if (
                Number.isNaN(start.getTime()) ||
                Number.isNaN(end.getTime()) ||
                end <= start ||
                end <= new Date()
            ) {
                return res.status(400).json({
                    error: "Start and deadline must be valid future-compatible dates, with deadline after start and in the future"
                });
            }

            const result = await pool.query(
                `INSERT INTO assignments
                 (title, description, questions, start_time,
 deadline, duration_minutes, time_limit_minutes, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7 ,$8)
                 RETURNING id, title, description, start_time,
                           deadline, duration_minutes, created_at`,
                [
                    title.trim(),
                    description.trim(),
                    JSON.stringify(questions),
                    start,
                    end,
                    duration_minutes,
                    duration_minutes,
                    req.user.id
                ]
            );

            return res.status(201).json({
                message: "Assignment created",
                assignment: result.rows[0]
            });
        } catch (error) {
            console.error("Create assignment error:", error.message);

            return res.status(500).json({
                error: "Could not create assignment"
            });
        }
    }
);

router.get("/", authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, title, description, start_time,
                    deadline, duration_minutes, created_at
             FROM assignments
             ORDER BY created_at DESC`
        );

        return res.json({ assignments: result.rows });
    } catch (error) {
        console.error("List assignments error:", error.message);

        return res.status(500).json({
            error: "Could not list assignments"
        });
    }
});

router.get("/:id", authenticateToken, async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id < 1) {
            return res.status(400).json({
                error: "Invalid assignment ID"
            });
        }

        const result = await pool.query(
            `SELECT id, title, description, start_time,
                    deadline, duration_minutes, created_at
             FROM assignments
             WHERE id = $1`,
            [id]
        );

        if (!result.rows.length) {
            return res.status(404).json({
                error: "Assignment not found"
            });
        }

        return res.json({
            assignment: result.rows[0]
        });
    } catch (error) {
        console.error("Get assignment error:", error.message);

        return res.status(500).json({
            error: "Could not retrieve assignment"
        });
    }
});

module.exports = router;