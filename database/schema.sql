-- =========================================================
-- PRODUCT PRICE TRACKER - DATABASE SCHEMA (SUPABASE POSTGRESQL)
-- =========================================================

-- Enable pgcrypto for gen_random_uuid()
create extension if not exists "pgcrypto";

-- =========================================================
-- 1. PRODUCTS TABLE
-- =========================================================
create table if not exists public.products (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    url text not null unique,
    image_url text,
    current_price numeric(12, 2),
    current_stock boolean,
    last_scraped_at timestamptz,
    next_scrape_at timestamptz default (now() + interval '2 hours'),
    structure_changed boolean default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- =========================================================
-- 2. SCRAPE LOGS TABLE
-- =========================================================
create table if not exists public.scrape_logs (
    id uuid primary key default gen_random_uuid(),
    product_id uuid references public.products(id) on delete cascade,
    attempt_number integer not null default 1,
    status text not null check (status in ('success', 'retry', 'failed')),
    timestamp timestamptz not null default now(),
    response_time_ms integer,
    price numeric(12, 2),
    in_stock boolean,
    error_type text,
    error_message text,
    selector_used text,
    structure_changed boolean default false,
    video_path text,
    metadata jsonb default '{}'::jsonb
);

-- =========================================================
-- 3. PRICE HISTORY TABLE
-- =========================================================
create table if not exists public.price_history (
    id uuid primary key default gen_random_uuid(),
    product_id uuid not null references public.products(id) on delete cascade,
    price numeric(12, 2) not null,
    in_stock boolean not null,
    scraped_at timestamptz not null default now(),
    scrape_log_id uuid references public.scrape_logs(id) on delete set null
);

-- =========================================================
-- INDEXES & CONSTRAINTS
-- =========================================================
create index if not exists idx_products_next_scrape on public.products(next_scrape_at);
create index if not exists idx_products_url on public.products(url);
create index if not exists idx_price_history_product on public.price_history(product_id, scraped_at desc);
create index if not exists idx_scrape_logs_product on public.scrape_logs(product_id, timestamp desc);
create index if not exists idx_scrape_logs_status on public.scrape_logs(status);

-- Auto-update updated_at timestamp trigger
create or replace function public.update_updated_at() returns trigger language plpgsql as $$
begin 
    new.updated_at = now(); 
    return new; 
end;
$$;

drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at 
    before update on public.products 
    for each row execute function public.update_updated_at();

-- Disable RLS for server-side service role access or enable with public read
alter table public.products enable row level security;
alter table public.price_history enable row level security;
alter table public.scrape_logs enable row level security;

-- Policies allowing full access to service role & anon read if needed
create policy "Allow all operations for service role on products" on public.products 
    for all using (true) with check (true);
create policy "Allow all operations for service role on price_history" on public.price_history 
    for all using (true) with check (true);
create policy "Allow all operations for service role on scrape_logs" on public.scrape_logs 
    for all using (true) with check (true);
