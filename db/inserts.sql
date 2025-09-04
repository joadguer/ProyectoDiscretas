USE habitos_db;

-- ==== USERS & PROFILES (30 usuarios) ====
INSERT INTO users (email, username, password) VALUES
('alice@example.com','alice','1234'),
('bob@example.com','bob','1234'),
('carol@example.com','carol','1234'),
('dave@example.com','dave','1234'),
('eve@example.com','eve','1234'),
('frank@example.com','frank','1234'),
('grace@example.com','grace','1234'),
('heidi@example.com','heidi','1234'),
('ivan@example.com','ivan','1234'),
('judy@example.com','judy','1234'),
('ken@example.com','ken','1234'),
('laura@example.com','laura','1234'),
('mike@example.com','mike','1234'),
('nancy@example.com','nancy','1234'),
('oscar@example.com','oscar','1234'),
('peggy@example.com','peggy','1234'),
('quinn@example.com','quinn','1234'),
('ruth@example.com','ruth','1234'),
('sam@example.com','sam','1234'),
('trudy@example.com','trudy','1234'),
('uma@example.com','uma','1234'),
('victor@example.com','victor','1234'),
('wendy@example.com','wendy','1234'),
('xavier@example.com','xavier','1234'),
('yvonne@example.com','yvonne','1234'),
('zack@example.com','zack','1234'),
('lara@example.com','lara','1234'),
('tom@example.com','tom','1234'),
('sofia@example.com','sofia','1234'),
('leo@example.com','leo','1234');

-- perfiles asociados
INSERT INTO profiles (user_id, first_name, last_name, gender, birth_date, is_public, bio) VALUES
(1,'Alice','Wonder','F','1995-01-10',1,'Me gusta leer'),
(2,'Bob','Builder','M','1990-05-15',1,'Construyo cosas'),
(3,'Carol','Singer','F','1992-03-22',1,'Canto en la ducha'),
(4,'Dave','Gamer','M','1998-07-11',1,'Fan de los videojuegos'),
(5,'Eve','Hacker','Otro','1994-12-01',1,'Rompiendo sistemas'),
(6,'Frank','Smith','M','1989-06-06',1,'Corredor aficionado'),
(7,'Grace','Taylor','F','1993-09-14',1,'Yoga lover'),
(8,'Heidi','Brown','F','1991-02-18',1,'Cocinar es mi terapia'),
(9,'Ivan','Lopez','M','1996-08-25',1,'Crossfit y café'),
(10,'Judy','Green','F','1997-11-30',1,'Dibujo en mis tiempos libres'),
(11,'Ken','White','M','1995-03-12',1,'Me gusta programar'),
(12,'Laura','Hill','F','1999-04-22',1,'Amante de los gatos'),
(13,'Mike','Fox','M','1993-10-05',1,'Me gusta escalar'),
(14,'Nancy','Stone','F','1992-02-27',1,'Cine y libros'),
(15,'Oscar','Wilde','M','1994-12-12',1,'Poeta aficionado'),
(16,'Peggy','Jones','F','1998-06-17',1,'Fan del running'),
(17,'Quinn','Black','Otro','1990-01-19',1,'Me gusta viajar'),
(18,'Ruth','King','F','1996-05-08',1,'Danza y música'),
(19,'Sam','Adams','M','1991-07-13',1,'Cerveza artesanal lover'),
(20,'Trudy','Scott','F','1995-08-29',1,'Hago senderismo'),
(21,'Uma','Patel','F','1993-09-09',1,'Lectura diaria'),
(22,'Victor','Miller','M','1997-03-03',1,'Fan del gym'),
(23,'Wendy','Clark','F','1995-10-21',1,'Bailar salsa'),
(24,'Xavier','Reed','M','1992-12-28',1,'Fotografía'),
(25,'Yvonne','Young','F','1994-07-07',1,'Arte digital'),
(26,'Zack','Ward','M','1996-11-01',1,'Escuchar podcasts'),
(27,'Lara','Croft','F','1993-06-14',1,'Exploradora'),
(28,'Tom','Hardy','M','1988-09-09',1,'Actor en potencia'),
(29,'Sofia','Rivera','F','1999-01-25',1,'Aprendiendo idiomas'),
(30,'Leo','Messi','M','1987-06-24',1,'Futbolista aficionado');

-- ==== HABITS (2-3 por usuario) ====
INSERT INTO habits (user_id, name) VALUES
(1,'Leer 30 minutos'),(1,'Caminar 5km'),
(2,'Ir al gimnasio'),(2,'Leer artículos'),
(3,'Meditar 10 min'),(3,'Cantar'),
(4,'Jugar 1 hora'),(4,'Correr 3km'),
(5,'Hackear CTFs'),(5,'Leer 20 min'),
(6,'Correr 5km'),(6,'Dibujar'),
(7,'Yoga 20 min'),(7,'Leer un libro'),
(8,'Cocinar'),(8,'Caminar 20 min'),
(9,'Crossfit'),(9,'Dormir 8h'),
(10,'Dibujar'),(10,'Leer novelas'),
(11,'Programar 1h'),(11,'Leer docs'),
(12,'Jugar con gatos'),(12,'Escribir diario'),
(13,'Escalar'),(13,'Meditar'),
(14,'Ver una peli'),(14,'Leer'),
(15,'Escribir poema'),(15,'Leer poesía'),
(16,'Correr'),(16,'Yoga'),
(17,'Viajar en bici'),(17,'Leer'),
(18,'Danzar'),(18,'Escuchar música'),
(19,'Cocinar cerveza'),(19,'Caminar'),
(20,'Senderismo'),(20,'Leer'),
(21,'Lectura diaria'),(21,'Meditar'),
(22,'Gym'),(22,'Correr'),
(23,'Bailar salsa'),(23,'Leer'),
(24,'Fotografía'),(24,'Correr'),
(25,'Arte digital'),(25,'Escribir'),
(26,'Podcasts'),(26,'Correr'),
(27,'Explorar ruinas'),(27,'Leer mapas'),
(28,'Actuar'),(28,'Meditar'),
(29,'Idiomas'),(29,'Leer'),
(30,'Futbol'),(30,'Correr');

-- ==== LOGS (últimos 10 días, aleatorios) ====
INSERT INTO logs (habit_id, day, value)
SELECT h.id, CURDATE() - INTERVAL (n.n) DAY, FLOOR(RAND()*2)
FROM habits h
JOIN (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) n;

-- ==== POSTS (1-2 por usuario) ====
INSERT INTO posts (author_id, content, visibility) VALUES
(1,'Hoy leí un libro interesante','public'),
(1,'Caminé bastante','friends'),
(2,'Fui al gimnasio','public'),
(3,'Meditación completada','public'),
(4,'Jugué una partida épica','friends'),
(5,'Resolví un CTF difícil','public'),
(6,'Corrí en el parque','public'),
(7,'Clase de yoga genial','public'),
(8,'Cocinando pasta fresca','friends'),
(9,'Entrenamiento de crossfit intenso','public'),
(10,'Un dibujo rápido','public');

-- ==== LIKES ====
INSERT INTO post_likes (post_id,user_id) VALUES
(1,2),(1,3),(2,1),(2,4),(3,2),(3,5),(4,6),(5,7),(6,8),(7,9),(8,10);

-- ==== COMMENTS ====
INSERT INTO post_comments (post_id,user_id,content) VALUES
(1,2,'Genial!'),
(1,3,'Me interesa el libro'),
(2,1,'Buen entrenamiento'),
(3,5,'La meditación ayuda mucho'),
(4,6,'Qué juego fue?'),
(5,7,'Crack!'),
(6,8,'Corre como viento'),
(7,9,'Namaste'),
(8,10,'Qué rico!');

-- ==== FRIENDSHIPS (bidireccionales, aleatorias) ====
INSERT INTO friendships (user_id, friend_id) VALUES
(1,2),(2,1),
(1,3),(3,1),
(2,4),(4,2),
(3,5),(5,3),
(4,6),(6,4),
(7,8),(8,7),
(9,10),(10,9),
(11,12),(12,11),
(13,14),(14,13),
(15,16),(16,15),
(17,18),(18,17),
(19,20),(20,19),
(21,22),(22,21),
(23,24),(24,23),
(25,26),(26,25),
(27,28),(28,27),
(29,30),(30,29);
