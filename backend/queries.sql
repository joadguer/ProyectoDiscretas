-- queries relacionados con matematicas discretas
-- Ranking de publicaciones más populares (más reacciones):
SELECT p.id, p.content, COUNT(r.id) AS total_reacciones
FROM posts p
LEFT JOIN reactions r ON p.id = r.post_id
GROUP BY p.id
ORDER BY total_reacciones DESC
LIMIT 10;


-- Usuarios con más publicaciones:
SELECT u.username,
       (SELECT COUNT(*) FROM posts WHERE user_id=u.id) +
       (SELECT COUNT(*) FROM comments WHERE user_id=u.id) +
       (SELECT COUNT(*) FROM reactions WHERE user_id=u.id) AS actividad
FROM users u
ORDER BY actividad DESC
LIMIT 10;

-- Relaciones tipo grafo (quién comentó/reaccionó en publicaciones de quién):
SELECT c.user_id AS quien_comenta, p.user_id AS autor_post, COUNT(*) AS interacciones
FROM comments c
JOIN posts p ON p.id=c.post_id
GROUP BY c.user_id, p.user_id;


