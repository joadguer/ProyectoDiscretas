USE habitos_db;

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