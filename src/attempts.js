const express = require("express");
const pool = require("./db");

const { authenticateToken } = require("./middleware");

const router = express.Router();

async function finishExpiredAttempt(client, attempt) {
    const now = Date.now();

    const result = await client.query(
        `SELECT questions , deadline
         FROM assignments
         WHERE id = $1`,
        [attempt.assignment_id]
    );

    const questions = result.rows[0]?.questions || [];

    const answerResult = await client.query(
        `SELECT question_id, answer
         FROM answers
         WHERE attempt_id = $1`,
        [attempt.id]
    );

    const submittedAnswers = new Map(
        answerResult.rows.map((row) => [
            row.question_id,
            row.answer
        ])
    );

    let score = 0;

    const totalMarks = questions.reduce(
        (sum, question) => sum + question.marks,
        0
    );

    for (const question of questions) {
        if (
            submittedAnswers.get(question.id) !== undefined &&
            submittedAnswers.get(question.id) !== null &&
            String(submittedAnswers.get(question.id)) ===
                String(question.correct_option)
        ) {
            score += question.marks;
        }
    }

    const assignmentDeadline = new Date(
    result.rows[0].deadline
).getTime();

const status =
    now >= new Date(attempt.expires_at).getTime() ||
    now >= assignmentDeadline
        ? "expired"
        : "submitted";

    const update = await client.query(
        `UPDATE attempts
         SET status = $1,
             submitted_at = NOW(),
             score = $2,
             total_marks = $3
         WHERE id = $4
           AND status = 'in_progress'
         RETURNING *`,
        [status, score, totalMarks, attempt.id]
    );

    return update.rows[0];
}

router.post(
    "/assignments/:assignmentId/start",
    authenticateToken,
    async (req, res) => {
        const client = await pool.connect();

        try {
            const assignmentId = Number(req.params.assignmentId);

            if (!Number.isInteger(assignmentId) || assignmentId < 1) {
                return res.status(400).json({
                    error: "Invalid assignment ID"
                });
            }

            await client.query("BEGIN");

            const result = await client.query(
                `SELECT *
                 FROM assignments
                 WHERE id = $1
                 FOR SHARE`,
                [assignmentId]
            );

            const assignment = result.rows[0];

            if (!assignment) {
                await client.query("ROLLBACK");

                return res.status(404).json({
                    error: "Assignment not found"
                });
            }

            const now = Date.now();
            const start = new Date(assignment.start_time).getTime();
            const deadline = new Date(assignment.deadline).getTime();

            if (now < start) {
                await client.query("ROLLBACK");

                return res.status(403).json({
                    error: "Assignment has not started"
                });
            }

            if (now >= deadline) {
                await client.query("ROLLBACK");

                return res.status(403).json({
                    error: "Assignment deadline has passed"
                });
            }

            const existing = await client.query(
                `SELECT *
                 FROM attempts
                 WHERE student_id = $1
                   AND assignment_id = $2
                   AND status = 'in_progress'
                 FOR UPDATE`,
                [req.user.id, assignmentId]
            );

            if (existing.rows.length) {
                const attempt = existing.rows[0];

                if (now >= new Date(attempt.expires_at).getTime()) {
                    await finishExpiredAttempt(client, attempt);
                    await client.query("COMMIT");

                    return res.status(409).json({
                        error: "Your attempt has expired"
                    });
                }

                await client.query("COMMIT");

                return res.json({
                    message: "Existing attempt resumed",
                    attempt: {
                        id: attempt.id,
                        started_at: attempt.started_at,
                        expires_at: attempt.expires_at,
                        status: attempt.status
                    }
                });
            }

            const expiresAt = new Date(
                Math.min(
                    now + assignment.duration_minutes * 60_000,
                    deadline
                )
            );

            const attemptResult = await client.query(
    `INSERT INTO attempts
     (student_id, assignment_id, started_at,deadline_at, expires_at)
     VALUES ($1, $2, NOW(), $3 , $3)
     RETURNING id, assignment_id, started_at, deadline_at,
               expires_at, status`,
    [req.user.id, assignmentId, expiresAt]
);

            await client.query("COMMIT");

            const safeQuestions = assignment.questions.map(
                ({ correct_option, ...question }) => question
            );

            return res.status(201).json({
                message: "Attempt started",
                attempt: attemptResult.rows[0],
                questions: safeQuestions
            });
        } catch (error) {
            await client.query("ROLLBACK");

            if (error.code === "23505") {
                return res.status(409).json({
                    error: "An active attempt already exists"
                });
            }

            console.error("Start attempt error:", error.message);

            return res.status(500).json({
                error: "Could not start attempt"
            });
        } finally {
            client.release();
        }
    }
);

router.post("/:attemptId/answers", authenticateToken, async (req, res) => {
    const client = await pool.connect();

    try {
        const attemptId = Number(req.params.attemptId);
        const { question_id, answer } = req.body;

        if (
            !Number.isInteger(attemptId) ||
            attemptId < 1 ||
            typeof question_id !== "string" ||
            typeof answer !== "string" ||
            answer.length > 1000
        ) {
            return res.status(400).json({
                error: "Invalid answer details"
            });
        }

        await client.query("BEGIN");

        const result = await client.query(
            `SELECT a.*, s.questions, s.deadline
             FROM attempts a
             JOIN assignments s ON s.id = a.assignment_id
             WHERE a.id = $1
               AND a.student_id = $2
             FOR UPDATE OF a`,
            [attemptId, req.user.id]
        );

        const attempt = result.rows[0];

        if (!attempt) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                error: "Attempt not found"
            });
        }

        if (attempt.status !== "in_progress") {
            await client.query("ROLLBACK");

            return res.status(409).json({
                error: "Attempt is no longer active"
            });
        }

        const now = Date.now();

        if (
            now >= new Date(attempt.expires_at).getTime() ||
            now >= new Date(attempt.deadline).getTime()
        ) {
            await finishExpiredAttempt(client, attempt);
            await client.query("COMMIT");

            return res.status(409).json({
                error: "Time is over; answers can no longer be changed"
            });
        }

        const question = attempt.questions.find(
            (item) => item.id === question_id
        );

        if (!question) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                error: "Question does not belong to this assignment"
            });
        }

        const optionIndex = Number(answer);

        if (
            !Number.isInteger(optionIndex) ||
            optionIndex < 0 ||
            optionIndex >= question.options.length
        ) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                error: "Invalid answer option"
            });
        }

        await client.query(
            `INSERT INTO answers (attempt_id, question_id, answer)
             VALUES ($1, $2, $3)
             ON CONFLICT (attempt_id, question_id)
             DO UPDATE SET answer = EXCLUDED.answer`,
            [attemptId, question_id, String(optionIndex)]
        );

        await client.query("COMMIT");

        return res.json({
            message: "Answer saved"
        });
    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Save answer error:", error.message);

        return res.status(500).json({
            error: "Could not save answer"
        });
    } finally {
        client.release();
    }
});

router.post("/:attemptId/submit", authenticateToken, async (req, res) => {
    const client = await pool.connect();

    try {
        const attemptId = Number(req.params.attemptId);

        if (!Number.isInteger(attemptId) || attemptId < 1) {
            return res.status(400).json({
                error: "Invalid attempt ID"
            });
        }

        await client.query("BEGIN");

        const result = await client.query(
            `SELECT a.*, s.questions, s.deadline
             FROM attempts a
             JOIN assignments s ON s.id = a.assignment_id
             WHERE a.id = $1
               AND a.student_id = $2
             FOR UPDATE OF a`,
            [attemptId, req.user.id]
        );

        const attempt = result.rows[0];

        if (!attempt) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                error: "Attempt not found"
            });
        }

        if (attempt.status !== "in_progress") {
            await client.query("ROLLBACK");

            return res.status(409).json({
                error: "Attempt already completed"
            });
        }

        const now = Date.now();

        if (
            now >= new Date(attempt.expires_at).getTime() ||
            now >= new Date(attempt.deadline).getTime()
        ) {
            const finished = await finishExpiredAttempt(client, attempt);

            await client.query("COMMIT");

            return res.json({
                message: "Time expired; attempt finalized",
                attempt: finished
            });
        }

        const finished = await finishExpiredAttempt(client, attempt);

        await client.query("COMMIT");

        return res.json({
            message: "Attempt submitted",
            attempt: finished
        });
    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Submit attempt error:", error.message);

        return res.status(500).json({
            error: "Could not submit attempt"
        });
    } finally {
        client.release();
    }
});
router.get("/my", authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                a.id AS attempt_id,
                a.assignment_id,
                s.title AS assignment_title,
                a.started_at,
                a.expires_at,
                a.submitted_at,
                a.status,
                a.score,
                a.total_marks
             FROM attempts a
             JOIN assignments s ON s.id = a.assignment_id
             WHERE a.student_id = $1
             ORDER BY a.started_at DESC`,
            [req.user.id]
        );

        return res.json({
            attempts: result.rows
        });
    } catch (error) {
        console.error("Attempt history error:", error.message);

        return res.status(500).json({
            error: "Could not retrieve attempt history"
        });
    }
});
module.exports = router;