CREATE DATABASE habitos_db CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'habitos_user'@'%' IDENTIFIED BY 'root';
GRANT ALL PRIVILEGES ON habitos_db.* TO 'habitos_user'@'%';
FLUSH PRIVILEGES;
EXIT;
