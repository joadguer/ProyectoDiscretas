import os, datetime
from contextlib import contextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel,  EmailStr, constr
from dotenv import load_dotenv
import mysql.connector
from mysql.connector import pooling

# --- Config ---
BASE_DIR = os.path.dirname(__file__)
FRONTEND_DIR = os.path.join(BASE_DIR, "..", "frontend")

load_dotenv(os.path.join(BASE_DIR, ".env"))

MYSQL_HOST = os.getenv("MYSQL_HOST", "localhost")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))
MYSQL_DB   = os.getenv("MYSQL_DB", "habitos_db")
MYSQL_USER = os.getenv("MYSQL_USER", "habitos_user")
MYSQL_PSW  = os.getenv("MYSQL_PASSWORD", "")

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")

# --- Pool de conexiones ---
POOL = pooling.MySQLConnectionPool(
    pool_name="habitos_pool",
    pool_size=5,
    host=MYSQL_HOST,
    port=MYSQL_PORT,
    database=MYSQL_DB,
    user=MYSQL_USER,
    password=MYSQL_PSW,
    charset="utf8mb4",
    collation="utf8mb4_0900_ai_ci",
    autocommit=False,
)

@contextmanager
def get_conn():
    con = POOL.get_connection()
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()

# --- App ---
app = FastAPI(title="Hábitos API (MySQL)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if CORS_ORIGINS == "*" else [CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Modelos ---
class Signup(BaseModel):
    email: str
    username: str
    password: str
    first_name: str
    last_name: str
    birth_date: constr(pattern=r"^\d{4}-\d{2}-\d{2}$")  # Formato obligatorio YYYY-MM-DD
    gender: str | None = None      # 'F','M','Otro' o None

class Login(BaseModel):
    username: str
    password: str

class ProfileUpdate(BaseModel):
    user_id: int
    first_name: str
    last_name: str
    gender: str | None = None      # 'F','M','Otro' o None
    birth_date: str | None = None  # 'YYYY-MM-DD' o None


class HabitIn(BaseModel):
    user_id: int
    name: str

class MarkToday(BaseModel):
    user_id: int
    habit_id: int
    value: int  # 0/1

# --- Endpoints Auth ---
@app.post("/signup")
def signup(p: Signup):
    # === Validaciones ===
    # Validar campos obligatorios
    if not p.email or not p.username or not p.password or not p.first_name or not p.last_name:
        raise HTTPException(400, "Correo, usuario, contraseña, nombre y apellido son obligatorios")
    
    # Validar fecha de nacimiento si está presente
    birth_date_obj = None
    if p.birth_date:
        import datetime
        try:
            birth_date_obj = datetime.datetime.strptime(p.birth_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(400, "Fecha de nacimiento inválida")
        
        today = datetime.date.today()
        age = today.year - birth_date_obj.year - ((today.month, today.day) < (birth_date_obj.month, birth_date_obj.day))
        if age < 5:
            raise HTTPException(400, "La edad mínima es de 5 años")

    # === Inserción en base de datos ===
    with get_conn() as con:
        cur = con.cursor(dictionary=True)
        cur.execute("SELECT 1 FROM users WHERE username=%s", (p.username,))
        if cur.fetchone():
            raise HTTPException(400, "Usuario ya existe")

        cur.execute(
            "INSERT INTO users(email, username, password) VALUES (%s,%s,%s)",
            (p.email, p.username, p.password)  # En producción: ¡hashear!
        )
        user_id = cur.lastrowid

        cur.execute(
            """
            INSERT INTO profiles(user_id, first_name, last_name, gender, birth_date)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (user_id, p.first_name, p.last_name, p.gender, p.birth_date)
        )

        return {
            "user": {"id": user_id, "email": p.email, "username": p.username},
            "profile": {
                "first_name": p.first_name,
                "last_name": p.last_name,
                "gender": p.gender,
                "birth_date": p.birth_date
            }
        }

@app.post("/login")
def login(p: Login):
    with get_conn() as con:
        cur = con.cursor(dictionary=True)
        cur.execute(
            "SELECT id, email, username FROM users WHERE username=%s AND password=%s",
            (p.username, p.password)
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(401, "Credenciales inválidas")

        cur.execute(
            "SELECT first_name, last_name, gender, birth_date FROM profiles WHERE user_id=%s",
            (row["id"],)
        )
        prof = cur.fetchone()

        return {"user": row, "profile": prof}


@app.put("/profile")
def update_profile(p: ProfileUpdate):
    with get_conn() as con:
        cur = con.cursor()
        # Asegurar que exista el user y su perfil
        cur.execute("SELECT 1 FROM users WHERE id=%s", (p.user_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Usuario no encontrado")

        # Actualizar perfiles
        cur.execute("""
            UPDATE profiles
            SET first_name=%s, last_name=%s, gender=%s, birth_date=%s
            WHERE user_id=%s
        """, (p.first_name, p.last_name, p.gender, p.birth_date, p.user_id))

        # Devolver perfil actualizado
        cur = con.cursor(dictionary=True)
        cur.execute("SELECT first_name, last_name, gender, birth_date FROM profiles WHERE user_id=%s", (p.user_id,))
        prof = cur.fetchone()
        return {"profile": prof}

# --- Endpoints Hábitos ---
@app.get("/habits")
def list_habits(user_id: int = Query(...)):
    with get_conn() as con:
        cur = con.cursor(dictionary=True)
        cur.execute("SELECT id, name FROM habits WHERE user_id=%s ORDER BY id DESC", (user_id,))
        habits = cur.fetchall()
        return {"habits": habits}

@app.post("/habits")
def add_habit(p: HabitIn):
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("INSERT INTO habits(user_id, name) VALUES (%s,%s)", (p.user_id, p.name))
        habit_id = cur.lastrowid
        return {"ok": True, "id": habit_id}

@app.delete("/habits/{habit_id}")
def delete_habit(habit_id: int, user_id: int = Query(...)):
    with get_conn() as con:
        cur = con.cursor()
        # Borrar logs del hábito del usuario + el hábito
        cur.execute(
            "DELETE l FROM logs l JOIN habits h ON h.id=l.habit_id WHERE h.id=%s AND h.user_id=%s",
            (habit_id, user_id)
        )
        cur.execute("DELETE FROM habits WHERE id=%s AND user_id=%s", (habit_id, user_id))
        return {"ok": True}

# --- Endpoints Logs ---
@app.post("/logs/mark_today")
def mark_today(p: MarkToday):
    if p.value not in (0,1):
        raise HTTPException(400, "value debe ser 0 o 1")
    today = datetime.date.today()
    with get_conn() as con:
        cur = con.cursor()
        # Validar propiedad del hábito
        cur.execute("SELECT 1 FROM habits WHERE id=%s AND user_id=%s", (p.habit_id, p.user_id))
        if not cur.fetchone():
            raise HTTPException(403, "No autorizado")
        # UPSERT por UNIQUE(habit_id, day)
        cur.execute(
            """
            INSERT INTO logs(habit_id, day, value) VALUES (%s,%s,%s)
            ON DUPLICATE KEY UPDATE value=VALUES(value)
            """,
            (p.habit_id, today, p.value)
        )
        return {"ok": True}

@app.get("/stats/weekly")
def stats_weekly(user_id: int = Query(...)):
    today = datetime.date.today()
    start = today - datetime.timedelta(days=6)
    with get_conn() as con:
        cur = con.cursor(dictionary=True)
        cur.execute("SELECT id, name FROM habits WHERE user_id=%s", (user_id,))
        habits = cur.fetchall()
        items = []
        for h in habits:
            cur.execute(
                "SELECT day, value FROM logs WHERE habit_id=%s AND day BETWEEN %s AND %s",
                (h["id"], start, today)
            )
            vals = cur.fetchall()
            day_map = {row["day"]: int(row["value"]) for row in vals}
            done = 0
            for i in range(7):
                d = start + datetime.timedelta(days=i)
                done += day_map.get(d, 0)
            today_done = bool(day_map.get(today, 0))
            items.append({
                "habit_id": h["id"],
                "habit_name": h["name"],
                "done": done,
                "total_days": 7,
                "today_done": today_done
            })
        return {"today": today.isoformat(), "items": items}

# --- Servir frontend estático ---
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="static")
