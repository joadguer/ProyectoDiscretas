USE habitos_db;

-- Publicaciones que hacen los usuarios
CREATE TABLE IF NOT EXISTS posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Comentarios en publicaciones
CREATE TABLE IF NOT EXISTS comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  user_id INT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Reacciones (like, clap, etc.)
CREATE TABLE IF NOT EXISTS reactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  post_id INT NOT NULL,
  user_id INT NOT NULL,
  type ENUM('like','clap','star') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(post_id, user_id, type), -- cada user solo 1 reacción de un tipo por post
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;



-- prueba para la api

-- feed de posts (incluye likes y visiblidad)
-- :user_id, :limit, :offset son parámetros
-- SELECT
--   p.id,
--   p.content,
--   p.created_at,
--   u.username AS author,
--   COALESCE(lc.likes, 0)      AS like_count,
--   COALESCE(cc.comments, 0)   AS comment_count,
--   EXISTS(
--     SELECT 1
--     FROM post_likes pl
--     WHERE pl.post_id = p.id AND pl.user_id = :user_id
--   )                          AS liked_by_me
-- FROM posts p
-- JOIN users u ON u.id = p.author_id
-- LEFT JOIN (
--   SELECT post_id, COUNT(*) AS likes
--   FROM post_likes
--   GROUP BY post_id
-- ) lc ON lc.post_id = p.id
-- LEFT JOIN (
--   SELECT post_id, COUNT(*) AS comments
--   FROM post_comments
--   GROUP BY post_id
-- ) cc ON cc.post_id = p.id
-- WHERE
--   p.visibility = 'public'
--   OR p.author_id IN (SELECT friend_id FROM friendships WHERE user_id = :user_id)
-- ORDER BY p.created_at DESC
-- LIMIT :limit OFFSET :offset;



-- Comentarios por post (paginados)
-- :post_id, :limit, :offset 
-- SELECT c.id, c.content, c.created_at, u.username
-- FROM post_comments c
-- JOIN users u ON u.id = c.user_id
-- WHERE c.post_id = :post_id
-- ORDER BY c.created_at ASC
-- LIMIT :limit OFFSET :offset;


-- Insertar comentario
-- :post_id, :user_id, :content
-- INSERT INTO post_comments (post_id, user_id, content)
-- VALUES (:post_id, :user_id, :content);

-- Toggle like (idempotente sencillo) para cuando se de like y se quite
-- -- 1) intentar borrar
-- DELETE FROM post_likes
-- WHERE post_id = :post_id AND user_id = :user_id;

-- -- 2) si row_count = 0, entonces insertar
-- INSERT INTO post_likes (post_id, user_id) VALUES (:post_id, :user_id);
