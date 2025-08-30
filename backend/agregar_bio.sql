USE habitos_db;

-- Añadir campos al perfil
ALTER TABLE profiles
  ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0 AFTER birth_date,
  ADD COLUMN bio VARCHAR(200) NULL AFTER is_public;

-- Índices recomendados
CREATE INDEX idx_profiles_is_public ON profiles(is_public);
CREATE INDEX idx_habits_user      ON habits(user_id);
CREATE INDEX idx_logs_habit_day   ON logs(habit_id, day);
