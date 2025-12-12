# Get started

## Prerequisites:

Everyone on the team **must** have these installed on their computer before starting:

1. Node.js - v22.17.1

- Check command: `node -v`

2. MySQL server - v8.3

- Required: You must know the root password you set during installation.

3. Git

## Install Dependencies

### 1. Install Client (Frontend) libraries

```
cd src/client
```

```
npm install
```

### 2. Install Server (Backend) libraries

```
cd ../server
```

```
npm install
```

## DB Config

**You need to connect the code to your local MySQL database.**

1. Go to src/server/.

2. Look for the file .env.example.

3. Copy and paste it, then rename the copy to .env.

4. Open the new .env file and type in **YOUR** MySQL password and DB name.

5. Create the empty database: Open your MySQL Workbench (or terminal) and run:

```
CREATE DATABASE DB_NAME;
```

## DB Structure

Now, ask Prisma to create all the tables (Sites, Devices, etc.) for you automatically.

In your terminal (inside src/server):

```
npx prisma db push
```

## Run the system

You will need two terminals:

- Backend

```
cd src/server
```

```
npm run dev
```

- Frontend

```
cd src/client
```

```
npm run dev
```

**Done!** You must be able to open the links shown in your terminals to access the system.
