# Vouch Backend

Vouch is a backend application for managing assignments, student attempts, deadlines, and automatic scoring.

## Features

- Student registration and login
- JWT-based authentication
- Student and administrator roles
- Assignment creation and listing
- Timed assignment attempts
- Assignment deadline enforcement
- Answer submission and automatic scoring
- Students can view their own attempt history
- PostgreSQL database integration

## Technologies Used

- Node.js
- Express.js
- PostgreSQL
- JavaScript
- JWT Authentication
- bcryptjs
- dotenv

## Prerequisites

- Node.js and npm
- PostgreSQL
- Visual Studio Code

## Installation

1. Clone the repository.
2. Open the project folder in VS Code.
3. Install dependencies:

   npm install

4. Create a `.env` file in the project root and configure your database credentials and JWT secret.

## Environment Variables

Configure the following variables in your `.env` file:

PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=vouch_db
DB_USER=your_database_username
DB_PASSWORD=your_database_password
JWT_SECRET=your_secret_key

Do not upload your `.env` file to GitHub.

## Run the Application

Start the backend server:

node src/server.js

The server runs on port 3000 by default.

## Health Check

Open the following endpoint to check the server and database connection:

http://localhost:3000/health

## API Modules

- `/api/auth` — Registration and login
- `/api/assignments` — Assignment creation and listing
- `/api/attempts` — Assignment attempts, answers, submission, and history
- `/health` — Server and database health check

## Testing

Run the available tests:

npm test

## Security

- Passwords are hashed before storage.
- Protected endpoints require authentication.
- Administrator-only operations require the administrator role.
- Students can access their own attempt history.

## Author

Syed Naziya