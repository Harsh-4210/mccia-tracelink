import sqlite3
import os

db_path = "tracelink.sqlite3"
if not os.path.exists(db_path):
    print("DB not found at", db_path)
    exit(1)

conn = sqlite3.connect(db_path)
# In case the user hasn't logged in yet, try to find them, or just insert them
res = conn.execute("SELECT * FROM users WHERE email='harshjain0621@gmail.com'").fetchall()
if not res:
    import uuid
    user_id = str(uuid.uuid4())
    conn.execute("INSERT INTO users (user_id, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)",
                 (user_id, "harshjain0621@gmail.com", "FIREBASE_AUTH", "Harsh Jain", "admin"))
    print("Created user and set to admin.")
else:
    conn.execute("UPDATE users SET role='admin' WHERE email='harshjain0621@gmail.com'")
    print("Updated existing user to admin.")

conn.commit()
conn.close()
