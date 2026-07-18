-- Esquema de base de datos para el Asistente de Trabajo
-- Ejecutar esto en Supabase: menú izquierdo -> SQL Editor -> New query -> pegar todo -> Run

-- Clientes
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  direccion text,
  notas text,
  creado_en timestamptz default now()
);

-- Equipos instalados en casa de un cliente (para mantenimientos futuros)
create table if not exists equipos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id) on delete cascade,
  tipo text not null, -- ej: "termotanque", "aire acondicionado"
  descripcion text,
  fecha_instalacion date not null,
  proximo_mantenimiento date,
  aviso_automatico boolean default false, -- true = se le manda mensaje solo al cliente
  aviso_enviado boolean default false, -- evita mandar el mismo aviso todos los días
  creado_en timestamptz default now()
);

-- Presupuestos
create table if not exists presupuestos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id) on delete cascade,
  descripcion text not null,
  monto numeric,
  estado text default 'pendiente', -- pendiente | aceptado | rechazado | no_concretado
  fecha_creacion timestamptz default now(),
  fecha_ultimo_contacto timestamptz default now()
);

-- Trabajos realizados (registro, incluye lo dictado por audio a futuro)
create table if not exists trabajos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id) on delete cascade,
  presupuesto_id uuid references presupuestos(id),
  descripcion text not null,
  fecha date default current_date,
  creado_en timestamptz default now()
);

-- Cobros / pagos
create table if not exists cobros (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id) on delete cascade,
  presupuesto_id uuid references presupuestos(id),
  monto numeric not null,
  estado text default 'pendiente', -- pendiente | cobrado
  fecha_vencimiento date,
  fecha_cobro date,
  creado_en timestamptz default now()
);

-- Recordatorios generales (para el usuario, no para el cliente)
create table if not exists recordatorios (
  id uuid primary key default gen_random_uuid(),
  texto text not null,
  fecha_hora timestamptz not null,
  cumplido boolean default false,
  creado_en timestamptz default now()
);

-- Índices útiles
create index if not exists idx_equipos_mantenimiento on equipos(proximo_mantenimiento);
create index if not exists idx_presupuestos_estado on presupuestos(estado);
create index if not exists idx_cobros_estado on cobros(estado);
create index if not exists idx_recordatorios_fecha on recordatorios(fecha_hora);
