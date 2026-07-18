-- Exemplo simples de carga inicial para homologacao do MVP.
-- Gere o hash da senha antes de executar:
-- .venv\Scripts\python.exe -c "from core.domain.rules import hash_password; print(hash_password('123456'))"

insert into areas (id, name)
values
  ('11111111-1111-1111-1111-111111111111', 'Operacoes'),
  ('22222222-2222-2222-2222-222222222222', 'Comercial')
on conflict (id) do nothing;

insert into users (id, email, password_hash, name, role, area_id, is_active)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'gestor@empresa.com',
    'COLE_AQUI_HASH_123456',
    'Gestor Operacoes',
    'gestor_area',
    '11111111-1111-1111-1111-111111111111',
    true
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'executivo@empresa.com',
    'COLE_AQUI_HASH_123456',
    'Executivo Geral',
    'executivo',
    null,
    true
  )
on conflict (id) do nothing;

insert into indicators (
  id,
  area_id,
  name,
  description,
  aggregation_type,
  unit,
  target_value,
  created_by,
  is_active
)
values
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '11111111-1111-1111-1111-111111111111',
    'Produtividade semanal',
    'Indicador de produtividade da area de operacoes',
    'avg',
    '%',
    95,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    true
  )
on conflict (id) do nothing;
