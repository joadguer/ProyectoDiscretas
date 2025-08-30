
USE habitos_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  username VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS profiles (
  user_id     INT PRIMARY KEY,
  first_name  VARCHAR(100) NOT NULL,
  last_name   VARCHAR(100) NOT NULL,
  gender      ENUM('F','M','Otro') NULL,
  birth_date  DATE NULL,
  is_public   TINYINT(1) NOT NULL DEFAULT 0,
  bio         VARCHAR(200) NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS habits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  CONSTRAINT fk_habits_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  habit_id INT NOT NULL,
  day DATE NOT NULL,
  value TINYINT(1) NOT NULL CHECK (value IN (0,1)),
  CONSTRAINT uq_habit_day UNIQUE (habit_id, day),
  CONSTRAINT fk_logs_habit
    FOREIGN KEY (habit_id) REFERENCES habits(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;



-- refactorizaciones agregadas
CREATE INDEX idx_profiles_is_public ON profiles(is_public);
CREATE INDEX idx_habits_user      ON habits(user_id);
CREATE INDEX idx_logs_habit_day   ON logs(habit_id, day);


-- Publicaciones que hacen los usuarios
-- CREATE TABLE IF NOT EXISTS posts (
--   id INT AUTO_INCREMENT PRIMARY KEY,
--   user_id INT NOT NULL,
--   content TEXT NOT NULL,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
-- ) ENGINE=InnoDB;

-- -- Comentarios en publicaciones
-- CREATE TABLE IF NOT EXISTS comments (
--   id INT AUTO_INCREMENT PRIMARY KEY,
--   post_id INT NOT NULL,
--   user_id INT NOT NULL,
--   content TEXT NOT NULL,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
--   FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
-- ) ENGINE=InnoDB;

-- -- Reacciones (like, clap, etc.)
-- CREATE TABLE IF NOT EXISTS reactions (
--   id INT AUTO_INCREMENT PRIMARY KEY,
--   post_id INT NOT NULL,
--   user_id INT NOT NULL,
--   type ENUM('like','clap','star') NOT NULL,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   UNIQUE(post_id, user_id, type), -- cada user solo 1 reacción de un tipo por post
--   FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
--   FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
-- ) ENGINE=InnoDB;

-- Posts
CREATE TABLE IF NOT EXISTS posts (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  author_id   INT NOT NULL,
  habit_id    INT NULL,
  content     TEXT NOT NULL,
  visibility  ENUM('public','friends') NOT NULL DEFAULT 'public',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_posts_author_created (author_id, created_at DESC),
  INDEX idx_posts_created (created_at DESC),
  CONSTRAINT fk_posts_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_posts_habit  FOREIGN KEY (habit_id)  REFERENCES habits(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Likes (una reacción simple tipo “me gusta”)
CREATE TABLE IF NOT EXISTS post_likes (
  post_id  INT NOT NULL,
  user_id  INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(post_id, user_id),
  INDEX idx_likes_user (user_id),
  CONSTRAINT fk_likes_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_likes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Comentarios
CREATE TABLE IF NOT EXISTS post_comments (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  post_id   INT NOT NULL,
  user_id   INT NOT NULL,
  content   VARCHAR(600) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_comments_post_created (post_id, created_at),
  CONSTRAINT fk_comments_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;



-- Amistades no dirigidas (guardaremos dos filas: A->B y B->A)
CREATE TABLE IF NOT EXISTS friendships (
  user_id   INT NOT NULL,
  friend_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, friend_id),
  CONSTRAINT fk_friend_user  FOREIGN KEY (user_id)   REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_friend_friend FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_no_self CHECK (user_id <> friend_id)
) ENGINE=InnoDB;

-- Índices útiles
CREATE INDEX idx_friendships_user   ON friendships(user_id);
CREATE INDEX idx_friendships_friend ON friendships(friend_id);


-- datos de prueba
USE habitos_db;

-- === Usuarios (del id=2 en adelante) ===
INSERT INTO users (email, username, password) VALUES
('josue@gmail.com','josue','root123'),      -- id=1 
('bob@example.com','bob','1234'),      -- id=2
('carol@example.com','carol','1234'),  -- id=3
('dave@example.com','dave','1234'),    -- id=4
('eve@example.com','eve','1234');      -- id=5


INSERT INTO profiles (user_id, first_name, last_name, gender, birth_date, is_public) VALUES
(1,'Josue','Guerrero','M','1995-03-20',1);  -- Usuario real (id=1)

-- === Perfiles ===
INSERT INTO profiles (user_id, first_name, last_name, gender, birth_date, is_public, bio) VALUES
(2,'Bob','Builder','M','1995-03-20',1,'Fan del gimnasio y la cocina'),
(3,'Carol','Singer','F','2000-07-10',1,'Me gusta cantar y meditar'),
(4,'Dave','Gamer','M','1997-01-25',1,'Apasionado de los videojuegos'),
(5,'Eve','Hacker','Otro','1994-12-01',1,'Me encantan los retos de lógica');

-- === Hábitos ===
INSERT INTO habits (user_id, name) VALUES
(2,'Ir al gimnasio'),
(2,'Leer 30 min'),
(3,'Meditar 10 min'),
(4,'Correr 5km'),
(5,'Leer artículos de ciberseguridad'),
(5,'Meditar');

-- === Amistades (bidireccionales) ===
INSERT INTO friendships (user_id, friend_id) VALUES
(1,2),(2,1),  -- Usuario real (id=1) es amigo de Bob
(2,3),(3,2),  -- Bob y Carol
(3,4),(4,3),  -- Carol y Dave
(4,5),(5,4);  -- Dave y Eve

-- === Logs de hábitos (últimos días) ===
-- Bob fue al gimnasio 3 veces la última semana
INSERT INTO logs (habit_id, day, value) VALUES
((SELECT id FROM habits WHERE user_id=2 AND name='Ir al gimnasio'),'2025-08-23',1),
((SELECT id FROM habits WHERE user_id=2 AND name='Ir al gimnasio'),'2025-08-25',1),
((SELECT id FROM habits WHERE user_id=2 AND name='Ir al gimnasio'),'2025-08-27',1);

-- Carol meditó 5 días seguidos
INSERT INTO logs (habit_id, day, value) VALUES
((SELECT id FROM habits WHERE user_id=3 AND name='Meditar 10 min'),'2025-08-23',1),
((SELECT id FROM habits WHERE user_id=3 AND name='Meditar 10 min'),'2025-08-24',1),
((SELECT id FROM habits WHERE user_id=3 AND name='Meditar 10 min'),'2025-08-25',1),
((SELECT id FROM habits WHERE user_id=3 AND name='Meditar 10 min'),'2025-08-26',1),
((SELECT id FROM habits WHERE user_id=3 AND name='Meditar 10 min'),'2025-08-27',1);

-- Dave corrió 2 veces
INSERT INTO logs (habit_id, day, value) VALUES
((SELECT id FROM habits WHERE user_id=4 AND name='Correr 5km'),'2025-08-24',1),
((SELECT id FROM habits WHERE user_id=4 AND name='Correr 5km'),'2025-08-26',1);

-- Eve meditó intercalado
INSERT INTO logs (habit_id, day, value) VALUES
((SELECT id FROM habits WHERE user_id=5 AND name='Meditar'),'2025-08-23',1),
((SELECT id FROM habits WHERE user_id=5 AND name='Meditar'),'2025-08-25',1),
((SELECT id FROM habits WHERE user_id=5 AND name='Meditar'),'2025-08-27',1);


UPDATE profiles SET is_public=1 WHERE user_id IN (2,3,4,5);
-- HOY
INSERT INTO logs(habit_id, day, value)
SELECT h.id, CURDATE(), 1
FROM habits h
JOIN profiles p ON p.user_id = h.user_id AND p.is_public = 1
ON DUPLICATE KEY UPDATE value=VALUES(value);

-- AYER
INSERT INTO logs(habit_id, day, value)
SELECT h.id, CURDATE() - INTERVAL 1 DAY, 1
FROM habits h
JOIN profiles p ON p.user_id = h.user_id AND p.is_public = 1
ON DUPLICATE KEY UPDATE value=VALUES(value);

-- HACE 2 DÍAS
INSERT INTO logs(habit_id, day, value)
SELECT h.id, CURDATE() - INTERVAL 2 DAY, 1
FROM habits h
JOIN profiles p ON p.user_id = h.user_id AND p.is_public = 1
ON DUPLICATE KEY UPDATE value=VALUES(value);
