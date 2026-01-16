## Project Overview
This is a simple application that send a message to recipient at exactly 9 am on their local time. For example, if one user is in New York and the second user is in Melbourne, they should be getting a message at 9 am in their own time.


## Requirements
- Using: Node.js + Typescript
- Simple API to create or delete user only:
  - POST /user
  - DELETE /user
- User has fields: 
  1. First name and last name, 
  2. Birth date
  3. Location (could be in any format of your choice)
  You can add more fields as you see fit to make the system works
- The system needs to send the following message at 9 am on users' local time via call external API to endpoint: https://email-service.digitalenvision.com.au/send-email, example format message: "Hey, {full_name} it's your birthday" 
  - Note that the API is not actually sending emails, but the status code will return normally.
  - Sometimes the API will return random errors or timeout.

Find below following curl format:

```
curl --location 'https://email-service.digitalenvision.com.au/send-email' \
--header 'Content-Type: application/json' \
--data-raw '{
    "email": "user@google.com",
    "message": "Hey, {full_name} it's your birthday"
}'
```

- The system needs to be able to recover and send all unsent messages if the service was down for a period (let's say a day)


## Things to Consider
- You may use any database technology you'd like, and you are allowed to take advantage of the database's internal mechanisms.
- You may use 3rd party libs such as express.js, moment.js, ORM etc to save development time.
- Make sure your code is scalable and has a good level of abstraction. For example, in the future we may want to add a happy anniversary message as well.
- Make sure your code is tested and testable.
- Be mindful of race conditions, duplicate messages are unacceptable
- Think about scalability (with the limits of localhost), will the system be able to handle thousands of birthdays a day?
- Extra point, add PUT /user for the user to edit their details. Make sure the birthday message will still be delivered on the correct day.


## What's Done
- Utilize `Docker` containerization for easier deployment with health check
- Use `TypeORM` that support database migration
- `Pino` logger for fast structured logging with trace_id mechanism
- Use `Zod` a lightweight, minimal overhad for schema validation
- Utilize `BullMQ` for job queue system and support exponential backoff retry logic
- Using `Opossum` as a circuit breaker
- Implement idempotency protection and race condition prevention
- Support graceful shutdown, allowing clean stopping services
- Separating process between API server & worker
- Connection pooling support for PostgreSQL
- Added manual trigger for late registered user that has a birthday on that day


## How to Run
### Development Mode
```bash
# Install dependencies
npm install

# Start infrastructure
cd docker && docker-compose up -d postgres redis

# Run migrations
npm run migrate:run

# Terminal 1: Start API
npm run dev:server

# Terminal 2: Start Worker
npm run dev:worker
```

### Production Mode
```bash
cd docker
docker-compose up -d
docker-compose exec app npm run migrate:run
```


## Testing
### Manual Testing
```bash
# Create user with today's birthday
curl -X POST http://localhost:3000/user \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "birthDate": "1990-01-15",
    "timezone": "America/New_York"
  }'

# Get User
curl http://localhost:3000/user/{USER_ID}


# Update User
curl -X PUT http://localhost:3000/user/{USER_ID} \
  -H "Content-Type: application/json" \
  -d '{
    "timezone": "America/Los_Angeles"
  }'

# Delete User
curl -X DELETE http://localhost:3000/user/{USER_ID}

# Check health
curl http://localhost:3000/health
```

### Verify Worker
```bash
# Check worker logs
docker-compose logs -f worker
```

### Verify Queue
```bash
# Connect to Redis
docker exec -it sdt-redis redis-cli

# List keys
KEYS *

# Check queue stats
KEYS bull:birthday-messages:*
```


## Database Schema
### users
- `id` (UUID, PK)
- `first_name`, `last_name`, `email`
- `birth_date` (DATE)
- `timezone` (IANA string)
- `created_at`, `updated_at`, `deleted_at`

### message_logs
- `id` (UUID, PK)
- `user_id` (FK → users)
- `message_type` (birthday, anniversary, etc.)
- `scheduled_date`, `scheduled_for` (exact UTC time)
- `idempotency_key` (UNIQUE)
- `status` (unprocessed, pending, processing, sent, failed, retrying)
- `attempt_count`, `last_attempt_at`, `sent_at`
- `error_message`
