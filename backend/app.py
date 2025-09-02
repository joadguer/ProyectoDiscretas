import os, datetime, math
from contextlib import contextmanager

from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, conint,  EmailStr, constr
from dotenv import load_dotenv
from typing import Optional, Literal,  List, Dict
from enum import Enum
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
@app.get("/public/users")
def public_users(
    q: Optional[str] = None,
    page: int = 1,
    page_size: int = 50
):
    if page <= 0 or page_size <= 0 or page_size > 200:
        raise HTTPException(400, "Parámetros de paginación inválidos")

    offset = (page - 1) * page_size
    like = f"%{q.strip()}%" if q else None

    with get_conn() as con:
        cur = con.cursor(dictionary=True)
        if like:
            cur.execute("""
                SELECT u.id, u.username, p.bio
                FROM profiles p
                JOIN users u ON u.id = p.user_id
                WHERE p.is_public=1 AND u.username LIKE %s
                ORDER BY u.username ASC
                LIMIT %s OFFSET %s
            """, (like, page_size, offset))
        else:
            cur.execute("""
                SELECT u.id, u.username, p.bio
                FROM profiles p
                JOIN users u ON u.id = p.user_id
                WHERE p.is_public=1
                ORDER BY u.username ASC
                LIMIT %s OFFSET %s
            """, (page_size, offset))
        items = cur.fetchall()

        # total públicos (para paginación)
        if like:
            cur.execute("""
                SELECT COUNT(*) AS total
                FROM profiles p JOIN users u ON u.id=p.user_id
                WHERE p.is_public=1 AND u.username LIKE %s
            """, (like,))
        else:
            cur.execute("SELECT COUNT(*) AS total FROM profiles WHERE is_public=1")
        total = cur.fetchone()["total"]

    return {"page": page, "page_size": page_size, "total": total, "items": items}

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

@app.get("/public/user/{username}")
def public_user_detail(username: str):
    today = datetime.date.today()
    start = today - datetime.timedelta(days=6)

    with get_conn() as con:
        cur = con.cursor(dictionary=True)
        # user + perfil público
        cur.execute("""
            SELECT u.id, u.username, p.bio, p.is_public
            FROM users u
            JOIN profiles p ON p.user_id = u.id
            WHERE u.username=%s
        """, (username,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Usuario no encontrado")
        if not row["is_public"]:
            raise HTTPException(403, "Este perfil no es público")

        user_id = row["id"]

        # número de hábitos
        cur.execute("SELECT COUNT(*) AS habits FROM habits WHERE user_id=%s", (user_id,))
        habits_count = cur.fetchone()["habits"]

        # días cumplidos (últimos 7)
        cur.execute("""
            SELECT COALESCE(SUM(CASE WHEN l.value=1 THEN 1 ELSE 0 END),0) AS done_days
            FROM habits h
            LEFT JOIN logs l ON l.habit_id=h.id AND l.day BETWEEN %s AND %s
            WHERE h.user_id=%s
        """, (start, today, user_id))
        done_days = cur.fetchone()["done_days"]

    return {
        "user": {"id": user_id, "username": row["username"], "bio": row["bio"]},
        "summary": {
            "window_days": 7,
            "range": {"start": start.isoformat(), "end": today.isoformat()},
            "habits_count": habits_count,
            "done_days": int(done_days)
        }
    }

@app.get("/public/rank")
def public_rank(
    window: int = Query(7, ge=1, le=365),  # aceptamos int, validamos abajo a 7/30
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    # normaliza a 7 o 30 (cualquier otro valor se redondea a 7)
    window = 30 if window == 30 else 7

    today = datetime.date.today()
    start = today - datetime.timedelta(days=window - 1)
    offset = (page - 1) * page_size

    with get_conn() as con:
        cur = con.cursor(dictionary=True)
        cur.execute("""
            SELECT u.id, u.username,
                   COALESCE(SUM(CASE WHEN l.value=1 THEN 1 ELSE 0 END), 0) AS done_days
            FROM users u
            JOIN profiles p ON p.user_id = u.id AND p.is_public = 1
            LEFT JOIN habits h ON h.user_id = u.id
            LEFT JOIN logs l   ON l.habit_id = h.id
                              AND l.day BETWEEN %s AND %s
            GROUP BY u.id, u.username
            ORDER BY done_days DESC, u.username ASC
            LIMIT %s OFFSET %s
        """, (start, today, page_size, offset))
        items = cur.fetchall()

        cur.execute("SELECT COUNT(*) AS total_public FROM profiles WHERE is_public=1")
        total_public = cur.fetchone()["total_public"]

    return {
        "window": window,
        "range": {"start": start.isoformat(), "end": today.isoformat()},
        "page": page, "page_size": page_size, "total_public": total_public,
        "items": items
    }

class FriendIn(BaseModel):
    user_id: int
    target_id: int


class FeedItem(BaseModel):
    id: int
    content: str
    created_at: str
    author: str
    like_count: int
    comment_count: int
    liked_by_me: bool

class PostIn(BaseModel):
    author_id: int
    content: str
    habit_id: int | None = None
    visibility: str = "public"  # 'public' | 'friends'

class PostOut(BaseModel):
    id: int
    author_id: int
    username: str | None = None
    content: str
    habit_id: int | None = None
    visibility: str
    created_at: str
    likes: int
    comments: int

class CommentIn(BaseModel):
    user_id: int
    content: str

class CommentOut(BaseModel):
    id: int
    content: str
    created_at: datetime.datetime #debe ser datetime porque si uso str me da error
    username: str

# por si decido agregarle reacciones
class ReactionType(str, Enum):
    like = "like"
    clap = "clap"
    star = "star"

class ReactionIn(BaseModel):
    post_id: int
    user_id: int
    type: str  # 'like','clap','star'

# Para /posts/{id}/like (like simple)
class LikeToggleOut(BaseModel):
    status: str          # "liked" | "unliked"
    like_count: int

# Para /posts/{id}/reactions/{type} (reacciones múltiples)
class ReactionToggleOut(BaseModel):
    status: str          # "added" | "removed"
    counts: dict[str,int]  # {"like": 3, "clap": 1, ...}

# Para devolver el resumen de reacciones de un post
class ReactionCount(BaseModel):
    type: ReactionType
    count: int

# class PostReactionsSummary(BaseModel):
#     post_id: int
#     totals: list[ReactionCount]
#     reacted_by_me: list[ReactionType]


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



class ProfileVisibility(BaseModel):
    user_id: int
    is_public: bool
    bio: Optional[str] = None

@app.put("/profile/visibility")
def set_profile_visibility(p: ProfileVisibility):
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("SELECT 1 FROM profiles WHERE user_id=%s", (p.user_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Perfil no encontrado")

        cur.execute("""
            UPDATE profiles
               SET is_public=%s, bio=%s
             WHERE user_id=%s
        """, (1 if p.is_public else 0, p.bio, p.user_id))

        cur = con.cursor(dictionary=True)
        cur.execute("""
            SELECT first_name, last_name, gender, birth_date, is_public, bio
            FROM profiles WHERE user_id=%s
        """, (p.user_id,))
        return {"profile": cur.fetchone()}





# ---------- HELPERS ----------
def _is_friend(con, a: int, b: int) -> bool:
    cur = con.cursor()
    cur.execute("SELECT 1 FROM friendships WHERE user_id=%s AND friend_id=%s", (a,b))
    return bool(cur.fetchone())


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

# @app.get("/posts/by_user")
# def posts_by_user(
#     author_id: int = Query(..., description="Dueño del perfil cuyos posts se listan"),
#     viewer_id: int = Query(..., description="Usuario logueado"),
#     page: int = Query(1, ge=1),
#     page_size: int = Query(10, ge=1, le=50),
#     require_owner: bool = Query(False),
# ):
#     if require_owner and author_id != viewer_id:
#         raise HTTPException(403, "Solo puedes ver tus propias publicaciones en 'Mis Posts'.")

#     offset = (page - 1) * page_size
#     with get_conn() as con:
#         cur = con.cursor(dictionary=True)

#         # ¿existe el autor? (y si no tiene profile, trátalo como no público)
#         cur.execute("SELECT is_public FROM profiles WHERE user_id=%s", (author_id,))
#         row = cur.fetchone()
#         if row is None:
#             cur2 = con.cursor()
#             cur2.execute("SELECT 1 FROM users WHERE id=%s", (author_id,))
#             if not cur2.fetchone():
#                 raise HTTPException(404, "Autor no encontrado")
#             is_public = False
#         else:
#             is_public = bool(row["is_public"])

#         friend = _is_friend(con, viewer_id, author_id)

#         if friend or viewer_id == author_id:
#             vis_sql = ""  # ve todo
#         else:
#             if not is_public:
#                 # Si prefieres 403 en vez de devolver vacío, cambia por:
#                 # raise HTTPException(403, "Este perfil no es público")
#                 return {"items": [], "page": page, "page_size": page_size}
#             vis_sql = "AND p.visibility='public'"

#         cur.execute(
#             f"""
#             SELECT p.id, p.author_id, u.username, p.content, p.habit_id, p.visibility, p.created_at,
#                    (SELECT COUNT(*) FROM post_likes    pl WHERE pl.post_id = p.id) AS likes,
#                    (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) AS comments
#             FROM posts p
#             JOIN users u ON u.id = p.author_id
#             WHERE p.author_id = %s {vis_sql}
#             ORDER BY p.created_at DESC, p.id DESC
#             LIMIT %s OFFSET %s
#             """,
#             (author_id, page_size, offset),
#         )
#         items = cur.fetchall()

#     return {"items": items, "page": page, "page_size": page_size, "self": viewer_id == author_id}


@app.post("/posts")
def create_post(p: PostIn):
    if not p.content.strip():
        raise HTTPException(400, "Contenido vacío")
    if p.visibility not in ("public", "friends"):
        raise HTTPException(400, "visibility inválido")
    with get_conn() as con:
        cur = con.cursor()
        # validar user
        cur.execute("SELECT 1 FROM users WHERE id=%s", (p.author_id,))
        if not cur.fetchone(): raise HTTPException(404, "Autor no existe")
        cur.execute("""
            INSERT INTO posts(author_id, habit_id, content, visibility)
            VALUES (%s,%s,%s,%s)
        """, (p.author_id, p.habit_id, p.content.strip(), p.visibility))
        pid = cur.lastrowid
        return {"ok": True, "id": pid}

@app.delete("/posts/{post_id}")
def delete_post(post_id: int, user_id: int = Query(...)):
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("DELETE FROM posts WHERE id=%s AND author_id=%s", (post_id, user_id))
        if cur.rowcount == 0:
            raise HTTPException(403, "No autorizado o post inexistente")
        return {"ok": True}

@app.post("/friends/add")
def friends_add(p: FriendIn):
    if p.user_id == p.target_id:
        raise HTTPException(400, "No puedes agregarte a ti mismo")
    with get_conn() as con:
        cur = con.cursor()
        # verifica que ambos usuarios existan
        cur.execute("SELECT 1 FROM users WHERE id=%s", (p.user_id,))
        if not cur.fetchone(): raise HTTPException(404, "Usuario no existe")
        cur.execute("SELECT 1 FROM users WHERE id=%s", (p.target_id,))
        if not cur.fetchone(): raise HTTPException(404, "Destino no existe")
        # inserta ambas direcciones (si ya existe, ignora)
        cur.execute("INSERT IGNORE INTO friendships(user_id, friend_id) VALUES (%s,%s)", (p.user_id, p.target_id))
        cur.execute("INSERT IGNORE INTO friendships(user_id, friend_id) VALUES (%s,%s)", (p.target_id, p.user_id))
        return {"ok": True}

@app.get("/friends/list")
def friends_list(user_id: int = Query(...)):
    with get_conn() as con:
        cur = con.cursor(dictionary=True)
        cur.execute("""
            SELECT u.id, u.username, p.bio, p.is_public
            FROM friendships f
            JOIN users u   ON u.id = f.friend_id
            LEFT JOIN profiles p ON p.user_id = u.id
            WHERE f.user_id = %s
            ORDER BY u.username ASC
        """, (user_id,))
        return {"friends": cur.fetchall()}

@app.delete("/friends/remove")
def friends_remove(user_id: int = Query(...), target_id: int = Query(...)):
    if user_id == target_id:
        raise HTTPException(400, "Operación inválida")
    with get_conn() as con:
        cur = con.cursor()
        cur.execute("DELETE FROM friendships WHERE user_id=%s AND friend_id=%s", (user_id, target_id))
        cur.execute("DELETE FROM friendships WHERE user_id=%s AND friend_id=%s", (target_id, user_id))
        return {"ok": True}

@app.get("/posts")
def list_posts(limit: int = 20):
    with get_conn() as con:
        cur = con.cursor(dictionary=True)
        cur.execute("""
            SELECT p.id, p.content, p.created_at, u.username
            FROM posts p JOIN users u ON u.id=p.author_id
            ORDER BY p.created_at DESC
            LIMIT %s
        """, (limit,))
        return {"posts": cur.fetchall()}

@app.get("/posts/feed")
def posts_feed(user_id: int = Query(...), page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=50)):
    offset = (page-1)*page_size
    with get_conn() as con:
        cur = con.cursor(dictionary=True)
        cur.execute("""
            SELECT
              p.id, p.author_id, u.username, p.content, p.habit_id, p.visibility, p.created_at,
              (SELECT COUNT(*) FROM post_likes    pl WHERE pl.post_id = p.id) AS likes,
              (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) AS comments,
              EXISTS(SELECT 1 FROM post_likes pl2 WHERE pl2.post_id = p.id AND pl2.user_id = %s) AS liked_by_me
            FROM posts p
            JOIN users u   ON u.id = p.author_id
            JOIN profiles pr ON pr.user_id = u.id
            WHERE
                 (pr.is_public = 1 OR p.visibility = 'public')
              OR (p.author_id = %s)
              OR (p.visibility='friends' AND EXISTS (
                    SELECT 1 FROM friendships f WHERE f.user_id=%s AND f.friend_id=p.author_id
                 ))
            ORDER BY p.created_at DESC, p.id DESC
            LIMIT %s OFFSET %s
        """, (user_id, user_id, user_id, page_size, offset))
        return {"items": cur.fetchall(), "page": page, "page_size": page_size}

    offset = (page-1)*page_size
    with get_conn() as con:
        cur = con.cursor(dictionary=True)
        # posts públicos
        cur.execute("""
            SELECT p.id, p.author_id, u.username, p.content, p.habit_id, p.visibility, p.created_at,
                   (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id=p.id) AS likes,
                   (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id=p.id) AS comments
            FROM posts p
            JOIN users u ON u.id = p.author_id
            JOIN profiles pr ON pr.user_id = u.id
            WHERE (pr.is_public=1 AND p.visibility='public')
               OR (p.author_id = %s)
               OR (p.visibility='friends' AND EXISTS (
                     SELECT 1 FROM friendships f WHERE f.user_id=%s AND f.friend_id=p.author_id
                  ))
            ORDER BY p.created_at DESC, p.id DESC
            LIMIT %s OFFSET %s
        """, (user_id, user_id, page_size, offset))
        return {"items": cur.fetchall(), "page": page, "page_size": page_size}

# Posts de un usuario (para perfil público o si es amigo, o si es su propio perfil)
@app.get("/posts/by_user")
def posts_by_user(
    author_id: int = Query(..., description="Dueño del perfil cuyos posts se listan"),
    viewer_id: int = Query(..., description="Usuario logueado"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    require_owner: bool = Query(False),
):
    if require_owner and author_id != viewer_id:
        raise HTTPException(403, "Solo puedes ver tus propias publicaciones en 'Mis Posts'.")

    offset = (page - 1) * page_size
    with get_conn() as con:
        cur = con.cursor(dictionary=True)

        # ¿existe el autor? (si no hay profile, trátalo como no público)
        cur.execute("SELECT is_public FROM profiles WHERE user_id=%s", (author_id,))
        row = cur.fetchone()
        if row is None:
            cur2 = con.cursor()
            cur2.execute("SELECT 1 FROM users WHERE id=%s", (author_id,))
            if not cur2.fetchone():
                raise HTTPException(404, "Autor no encontrado")
            is_public = False
        else:
            is_public = bool(row["is_public"])

        friend = _is_friend(con, viewer_id, author_id)

        if friend or viewer_id == author_id:
            vis_sql = ""  # ve todo
            params = (author_id, page_size, offset)
        else:
            if not is_public:
                return {"items": [], "page": page, "page_size": page_size}
            vis_sql = "AND p.visibility='public'"
            params = (author_id, page_size, offset)

        cur.execute(f"""
            SELECT p.id, p.author_id, u.username, p.content, p.habit_id, p.visibility, p.created_at,
                   (SELECT COUNT(*) FROM post_likes    pl WHERE pl.post_id = p.id) AS likes,
                   (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) AS comments
            FROM posts p
            JOIN users u ON u.id = p.author_id
            WHERE p.author_id = %s {vis_sql}
            ORDER BY p.created_at DESC, p.id DESC
            LIMIT %s OFFSET %s
        """, params)
        items = cur.fetchall()

    return {"items": items, "page": page, "page_size": page_size, "self": viewer_id == author_id}



@app.get("/posts/{post_id}/comments", response_model=List[CommentOut])
def list_comments(post_id: int, page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=50)):
    offset = (page-1)*page_size
    with get_conn() as con:
        cur = con.cursor(dictionary=True)
        cur.execute("""
            SELECT c.id, c.content, c.created_at, u.username
            FROM post_comments c
            JOIN users u ON u.id = c.user_id
            WHERE c.post_id = %s
            ORDER BY c.created_at ASC, c.id ASC
            LIMIT %s OFFSET %s
        """, (post_id, page_size, offset))
        return cur.fetchall()

@app.post("/posts/{post_id}/comments", status_code=201)
def create_comment(post_id: int, p: CommentIn):
    content = (p.content or "").strip()
    if not content:
        raise HTTPException(400, "Contenido vacío")
    if len(content) > 600:
        raise HTTPException(400, "Máximo 600 caracteres")

    with get_conn() as con:
        cur = con.cursor()
        # validar post
        cur.execute("SELECT 1 FROM posts WHERE id=%s", (post_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Post no existe")

        # insertar
        cur.execute("""
            INSERT INTO post_comments (post_id, user_id, content)
            VALUES (%s, %s, %s)
        """, (post_id, p.user_id, content))
        return {"ok": True, "id": cur.lastrowid}

@app.post("/posts/{post_id}/like", response_model=LikeToggleOut)
def toggle_like(post_id: int, user_id: int = Query(...)):
    with get_conn() as con:
        cur = con.cursor()
        # 1) intento borrar (si había like)
        cur.execute("DELETE FROM post_likes WHERE post_id=%s AND user_id=%s", (post_id, user_id))
        if cur.rowcount == 0:
            # 2) si no había, inserto
            cur.execute("INSERT INTO post_likes (post_id, user_id) VALUES (%s,%s)", (post_id, user_id))
            status = "liked"
        else:
            status = "unliked"

        cur = con.cursor(dictionary=True)
        cur.execute("SELECT COUNT(*) AS like_count FROM post_likes WHERE post_id=%s", (post_id,))
        like_count = cur.fetchone()["like_count"]

    return {"status": status, "like_count": like_count}



# por si agrego reacciones al frontend
@app.post("/posts/{post_id}/reactions/{rx_type}", response_model=ReactionToggleOut)
def toggle_reaction(post_id: int, rx_type: ReactionType, user_id: int = Query(...)):
    with get_conn() as con:
        cur = con.cursor()
        # toggle por (post_id, user_id, type)
        cur.execute("DELETE FROM post_reactions WHERE post_id=%s AND user_id=%s AND type=%s",
                    (post_id, user_id, rx_type.value))
        if cur.rowcount == 0:
            cur.execute("INSERT INTO post_reactions (post_id, user_id, type) VALUES (%s,%s,%s)",
                        (post_id, user_id, rx_type.value))
            status = "added"
        else:
            status = "removed"

        # devolver conteos por tipo
        cur = con.cursor(dictionary=True)
        cur.execute("""
            SELECT type, COUNT(*) AS n
            FROM post_reactions
            WHERE post_id=%s
            GROUP BY type
        """, (post_id,))
        counts = {row["type"]: int(row["n"]) for row in cur.fetchall()}

    return {"status": status, "counts": counts}


@app.get("/friends/suggested")
def friends_suggested(user_id: int = Query(...), limit: int = 20, window: int = 30):
    if limit <= 0 or limit > 100:
        raise HTTPException(400, "limit inválido (1..100)")
    if window not in (7, 30):
        raise HTTPException(400, "window inválido (7|30)")

    today = datetime.date.today()
    start = today - datetime.timedelta(days=window - 1)

    # reparto 30% / 30% / 20% / 20%
    n_foaf   = max(1, round(limit * 0.30))
    n_sim    = max(1, round(limit * 0.30))
    n_trend  = max(1, round(limit * 0.20))
    n_fill   = max(0, limit - (n_foaf + n_sim + n_trend))

    with get_conn() as con:
        cur = con.cursor(dictionary=True)

        # 0) conjunto de amigos actuales + yo (para excluir)
        cur.execute("SELECT friend_id FROM friendships WHERE user_id=%s", (user_id,))
        exclude_ids = {user_id} | {row["friend_id"] for row in cur.fetchall()}

        # 1) FOAF (amigos de mis amigos) con conteo de mutuos
        #    - públicos
        #    - no en exclude
        cur.execute("""
            SELECT f2.friend_id AS candidate, COUNT(*) AS mutuals
            FROM friendships f1
            JOIN friendships f2 ON f1.friend_id = f2.user_id
            JOIN profiles   p   ON p.user_id = f2.friend_id AND p.is_public=1
            WHERE f1.user_id = %s
              AND f2.friend_id <> %s
              AND f2.friend_id NOT IN (
                    SELECT friend_id FROM friendships WHERE user_id=%s
              )
            GROUP BY candidate
            ORDER BY mutuals DESC, candidate ASC
            LIMIT %s
        """, (user_id, user_id, user_id, n_foaf))
        foaf = cur.fetchall()

        # 2) Similares por hábitos (Jaccard aprox usando nombres de hábitos)
        #    candidatos: comparten al menos un nombre de hábito conmigo, públicos
        cur.execute("""
            WITH my_habits AS (
                SELECT DISTINCT name FROM habits WHERE user_id=%s
            ),
            cand AS (
                SELECT DISTINCT h.user_id AS candidate
                FROM habits h
                JOIN my_habits mh ON mh.name = h.name
                JOIN profiles p   ON p.user_id = h.user_id AND p.is_public=1
                WHERE h.user_id <> %s
            ),
            A AS (SELECT COUNT(*) AS ca FROM my_habits),
            I AS (
                SELECT h.user_id AS candidate, COUNT(*) AS inters
                FROM habits h
                JOIN my_habits mh ON mh.name = h.name
                WHERE h.user_id IN (SELECT candidate FROM cand)
                GROUP BY h.user_id
            ),
            B AS (
                SELECT h.user_id AS candidate, COUNT(DISTINCT name) AS cb
                FROM habits h
                WHERE h.user_id IN (SELECT candidate FROM cand)
                GROUP BY h.user_id
            )
            SELECT i.candidate,
                   i.inters / (a.ca + b.cb - i.inters) AS jaccard
            FROM I i CROSS JOIN A a
            JOIN B b ON b.candidate = i.candidate
            ORDER BY jaccard DESC, candidate ASC
            LIMIT %s
        """, (user_id, user_id, n_sim))
        sim = cur.fetchall()

        # 3) Trending: score = (amigos_count * 2) + done_days_window
        #    - públicos, excluidos fuera
        cur.execute("""
            WITH friend_counts AS (
              SELECT user_id, COUNT(*) AS fc
              FROM friendships
              GROUP BY user_id
            ),
            done30 AS (
              SELECT h.user_id, COALESCE(SUM(CASE WHEN l.value=1 THEN 1 ELSE 0 END),0) AS done_days
              FROM habits h
              LEFT JOIN logs l ON l.habit_id = h.id
                               AND l.day BETWEEN %s AND %s
              GROUP BY h.user_id
            )
            SELECT u.id AS candidate,
                   COALESCE(fc.fc,0)*2 + COALESCE(d.done_days,0) AS score
            FROM users u
            JOIN profiles p ON p.user_id = u.id AND p.is_public=1
            LEFT JOIN friend_counts fc ON fc.user_id = u.id
            LEFT JOIN done30 d        ON d.user_id = u.id
            WHERE u.id <> %s
            ORDER BY score DESC, u.username ASC
            LIMIT %s
        """, (start, today, user_id, n_trend))
        trend = cur.fetchall()

        # Combinar sin duplicados y excluyendo mis amigos / yo
        seen = set(exclude_ids)
        combined: List[Dict] = []
        def push(rows):
            for r in rows:
                cid = r.get("candidate") or r.get("id")
                if cid in seen: 
                    continue
                seen.add(cid)
                combined.append(cid)
                if len(combined) >= limit:
                    break

        push(foaf)
        if len(combined) < limit:
            push(sim)
        if len(combined) < limit:
            push(trend)

        # 4) Relleno aleatorio de públicos
        remaining = limit - len(combined)
        fill = []
        if remaining > 0:
            # Elegir públicos random no vistos
            cur.execute(f"""
                SELECT u.id AS candidate
                FROM users u 
                JOIN profiles p ON p.user_id=u.id AND p.is_public=1
                WHERE u.id NOT IN ({",".join(["%s"]*len(seen))})
                ORDER BY RAND()
                LIMIT %s
            """, (*seen, remaining))
            fill = cur.fetchall()
            push(fill)

        # resolver información básica de los IDs combinados
        if not combined:
            return {"items": []}

        cur.execute(f"""
            SELECT u.id, u.username, p.bio
            FROM users u
            LEFT JOIN profiles p ON p.user_id=u.id
            WHERE u.id IN ({",".join(["%s"]*len(combined))})
        """, tuple(combined))
        rows = cur.fetchall()

        # ordenar de acuerdo al orden de "combined"
        info = {r["id"]: r for r in rows}
        ordered = [info[cid] for cid in combined if cid in info]

    return {
        "window": window,
        "mix": {"foaf": n_foaf, "similar": n_sim, "trending": n_trend, "fill": n_fill},
        "items": ordered
    }

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

            done = sum(day_map.get(start + datetime.timedelta(days=i), 0) for i in range(7))
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
