-- Script para insertar usuarios de prueba
-- Ejecutar en PostgreSQL

-- Insertar usuario admin
INSERT INTO usuarios (email, password, nombre, role, estado) 
VALUES ('admin@ligaava.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86AGR4t1R1m', 'Administrador', 'admin', 'activo')
ON CONFLICT (email) DO NOTHING;

-- Insertar usuario árbitro
INSERT INTO usuarios (email, password, nombre, role, estado) 
VALUES ('arbitro@ligaava.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86AGR4t1R1m', 'Juan Pérez', 'arbitro', 'activo')
ON CONFLICT (email) DO NOTHING;

-- Insertar usuario delegado
INSERT INTO usuarios (email, password, nombre, role, estado) 
VALUES ('delegado@ligaava.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcg7b3XeKeUxWdeS86AGR4t1R1m', 'María García', 'delegado', 'activo')
ON CONFLICT (email) DO NOTHING;

-- Los passwords desencriptados son todos: "password123"

SELECT id, email, nombre, role FROM usuarios;
