-- Aplicar somente no projeto independente da Kahenna, após criar agendamentos.
-- Marcações manuais por consulta; nenhuma mensagem é enviada por este script.
alter table public.agendamentos
 add column if not exists lembrete_enviado_em timestamptz,
 add column if not exists confirmado_em timestamptz;
