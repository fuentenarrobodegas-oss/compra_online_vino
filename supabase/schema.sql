-- =====================================================================
-- Bodegas Fuentenarro · Tablas para la tienda online
-- Pégalo entero en Supabase > SQL Editor > New query > Run
-- =====================================================================

-- ---------- Perfiles de cliente (datos de envío guardados) ----------
create table if not exists public.perfiles (
    user_id     uuid primary key references auth.users (id) on delete cascade,
    nombre      text,
    telefono    text,
    direccion   text,
    cp          text,
    ciudad      text,
    provincia   text,
    updated_at  timestamptz default now()
);

alter table public.perfiles enable row level security;

drop policy if exists "perfil propio: ver" on public.perfiles;
drop policy if exists "perfil propio: crear" on public.perfiles;
drop policy if exists "perfil propio: editar" on public.perfiles;
create policy "perfil propio: ver"    on public.perfiles for select using (auth.uid() = user_id);
create policy "perfil propio: crear"  on public.perfiles for insert with check (auth.uid() = user_id);
create policy "perfil propio: editar" on public.perfiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Administradores (quién puede ver todos los pedidos) ----------
create table if not exists public.admins (
    user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;  -- sin políticas: nadie la lee desde el navegador

create or replace function public.es_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
    select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------- Pedidos ----------
create table if not exists public.pedidos (
    id                 uuid primary key default gen_random_uuid(),
    numero             bigint generated always as identity (start with 1001),
    created_at         timestamptz not null default now(),
    user_id            uuid references auth.users (id) on delete set null,
    estado             text not null default 'pendiente_pago'
                       check (estado in ('pendiente_pago', 'pagado', 'enviado', 'entregado', 'cancelado')),
    -- datos de envío
    nombre             text not null,
    email              text not null,
    telefono           text not null,
    direccion          text not null,
    cp                 text not null,
    ciudad             text not null,
    provincia          text not null,
    notas              text,
    -- contenido e importes (céntimos)
    items              jsonb not null,
    botellas           int not null,
    envio_cent         int not null default 0,
    total_cent         int not null,
    -- Stripe
    stripe_session_id  text,
    pagado_at          timestamptz,
    enviado_at         timestamptz
);

create index if not exists pedidos_estado_idx on public.pedidos (estado, created_at desc);
create index if not exists pedidos_user_idx   on public.pedidos (user_id, created_at desc);

alter table public.pedidos enable row level security;

-- Los pedidos solo los crea la Edge Function (con la clave de servicio), nunca el navegador.
drop policy if exists "cliente: ve sus pedidos" on public.pedidos;
drop policy if exists "admin: ve todos"         on public.pedidos;
drop policy if exists "admin: actualiza"        on public.pedidos;
create policy "cliente: ve sus pedidos" on public.pedidos for select using (auth.uid() = user_id);
create policy "admin: ve todos"         on public.pedidos for select using (public.es_admin());
create policy "admin: actualiza"        on public.pedidos for update using (public.es_admin()) with check (public.es_admin());

-- =====================================================================
-- DESPUÉS de crear tu cuenta en la web (y confirmar el correo), ejecuta
-- esto con TU correo para darte acceso al panel admin.html:
--
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'bodegas@fuentenarro.com';
-- =====================================================================
