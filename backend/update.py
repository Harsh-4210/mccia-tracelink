import sqlite3
conn = sqlite3.connect('tracelink.sqlite3')
conn.execute("UPDATE users SET role='admin' WHERE email='harshjain0621@gmail.com'")
conn.commit()
rows = conn.execute("SELECT email,role FROM users").fetchall()
for r in rows:
    print(r)
conn.close()
