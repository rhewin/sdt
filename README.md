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
