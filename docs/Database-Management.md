# Database Management

## Creating a Database

**Databases** page → **+ New Database**:

1. Enter a name (a-z, 0-9, _ only — e.g. `myapp_db`)
2. Optionally link to a site (for organization)
3. Click **Create Database**

The panel automatically:
- Creates the database with utf8mb4 charset
- Creates a database user (`u_<dbname>`)
- Generates a strong password
- Shows credentials **once** — save them!

```
Database: myapp_db
User:     u_myapp_db
Password: Xk9mP2nQ...
Host:     localhost
```

## Importing SQL

**Databases** page → **Import** button next to a database:

1. Click **Import**
2. Select a `.sql` file from your computer
3. Wait for import to complete (up to 64MB)

Or via Adminer (for larger files):
1. Install Adminer on any PHP site
2. Open Adminer URL → login with database credentials
3. Use the Import tab

## Exporting (Dump)

**Databases** page → **Dump .sql** button:
- Downloads a complete SQL dump of the database
- Includes all tables, data, and routines

## Password Management

**Databases** page → **Password** button:
- Generates a new random password
- Updates MariaDB user immediately
- Shows new password once — save it!

**Important:** After changing a database password, update your application's configuration (e.g. `wp-config.php` for WordPress, `.env` for Laravel/Node.js).

## Deleting a Database

**Databases** page → **Delete** button:
1. Type the database name to confirm
2. Database and user are permanently deleted

## WordPress Databases

When you use **Install WordPress** on a site, the database is created automatically and registered in the Databases page. You can manage it like any other database (dump, import, password, delete).

## Adminer (Advanced Database UI)

For phpMyAdmin-style management:
1. Any PHP site → detail → **Overview** → **Install Adminer**
2. A random URL is created (e.g. `https://yoursite.com/adminer-x7f3k2.php`)
3. Login with database credentials
4. Full database management (browse, edit, SQL, import/export)

**Security tip:** Delete the Adminer file when you're done using it.

## Connection Settings

| Setting | Value |
|---|---|
| Host | `localhost` |
| Port | `3306` (default, unix socket preferred) |
| Charset | `utf8mb4` |
| Auth | `mysql_native_password` |

Applications on the same server connect via:
```
Host: localhost
User: u_yourdbname
Password: (from panel)
Database: yourdbname
```
