begin;
-- Abort the upgrade if any existing balance or historical movement is changed.
create temporary table kahenna_saldos_antes on commit drop as select id,nome,categoria,unidade,estoque_minimo,quantidade,valor_estoque,ativo from public.estoque_produtos;
create temporary table kahenna_movimentos_antes on commit drop as select id,produto_id,tipo,quantidade,custo_unitario,valor_total,saldo_apos,ocorrido_em,motivo,fornecedor,usuario_id from public.estoque_movimentos;
alter table public.estoque_produtos
 add column revisao bigint not null default 0,
 add column embalagem_padrao text,
 add column conteudo_padrao numeric(12,3) not null default 1 check(conteudo_padrao>0);
update public.estoque_produtos set embalagem_padrao=unidade;
alter table public.estoque_produtos add constraint estoque_embalagem_check check(embalagem_padrao in ('un','ml','g','caixa','frasco','pacote','kg','l'));

create table public.estoque_lotes (
 id uuid primary key default gen_random_uuid(),
 produto_id uuid not null references public.estoque_produtos(id) on delete restrict,
 codigo text check(codigo is null or length(btrim(codigo)) between 1 and 80),
 validade date check(validade is null or validade between date '1900-01-01' and date '2200-12-31'),
 recebido_em date not null,
 quantidade_inicial numeric(12,3) not null check(quantidade_inicial>0),
 quantidade_restante numeric(12,3) not null check(quantidade_restante>=0 and quantidade_restante<=quantidade_inicial),
 saldo_anterior boolean not null default false,
 criado_em timestamptz not null default now()
);
create index estoque_lotes_disponiveis_idx on public.estoque_lotes(produto_id,validade,recebido_em,id) where quantidade_restante>0;
-- Existing balances remain unchanged and have no guessed batch or expiration.
insert into public.estoque_lotes(produto_id,recebido_em,quantidade_inicial,quantidade_restante,saldo_anterior)
 select p.id,coalesce((select min(m.ocorrido_em) from public.estoque_movimentos m where m.produto_id=p.id and m.tipo='entrada'),(p.criado_em at time zone 'America/Sao_Paulo')::date),p.quantidade,p.quantidade,true
 from public.estoque_produtos p where p.quantidade>0;

create table public.estoque_atendimentos (
 id uuid primary key,
 paciente_id uuid not null references public.visitantes(visitante_id) on delete restrict,
 descricao text not null check(length(btrim(descricao)) between 1 and 200),
 ocorrido_em date not null,
 custo_total numeric(18,4) not null default 0 check(custo_total>=0),
 usuario_id uuid references auth.users(id) on delete set null,
 dados_operacao jsonb not null,
 criado_em timestamptz not null default now()
);
create index estoque_atendimentos_paciente_idx on public.estoque_atendimentos(paciente_id,ocorrido_em desc,criado_em desc);
create index estoque_atendimentos_data_idx on public.estoque_atendimentos(ocorrido_em desc,criado_em desc);
create index estoque_atendimentos_usuario_idx on public.estoque_atendimentos(usuario_id);
create table public.estoque_listas_pacientes (
 paciente_id uuid primary key references public.visitantes(visitante_id) on delete restrict,
 itens jsonb not null check(jsonb_typeof(itens)='array' and jsonb_array_length(itens)<=30),
 atualizado_por uuid references auth.users(id) on delete set null,
 atualizado_em timestamptz not null default now()
);
create index estoque_listas_usuario_idx on public.estoque_listas_pacientes(atualizado_por);
create table public.estoque_conversoes (
 id uuid primary key,
 produto_id uuid not null references public.estoque_produtos(id) on delete restrict,
 usuario_id uuid references auth.users(id) on delete set null,
 unidade_anterior text not null,
 unidade_nova text not null,
 fator numeric not null check(fator>0),
 quantidade_anterior numeric not null,
 quantidade_nova numeric not null,
 valor_preservado numeric not null,
 criado_em timestamptz not null default now()
);
create index estoque_conversoes_produto_idx on public.estoque_conversoes(produto_id,criado_em);
create index estoque_conversoes_usuario_idx on public.estoque_conversoes(usuario_id);
create table public.estoque_cadastros_operacoes (
 id uuid primary key,
 produto_id uuid not null references public.estoque_produtos(id) on delete restrict,
 usuario_id uuid references auth.users(id) on delete set null,
 dados jsonb not null,
 resultado jsonb not null,
 criado_em timestamptz not null default now()
);
create index estoque_cadastros_produto_idx on public.estoque_cadastros_operacoes(produto_id);
create index estoque_cadastros_usuario_idx on public.estoque_cadastros_operacoes(usuario_id);

alter table public.estoque_movimentos
 add column unidade_registro text,
 add column dados_operacao jsonb,
 add column lote_id uuid references public.estoque_lotes(id) on delete restrict,
 add column atendimento_id uuid references public.estoque_atendimentos(id) on delete restrict;
update public.estoque_movimentos m set unidade_registro=p.unidade from public.estoque_produtos p where p.id=m.produto_id;
alter table public.estoque_movimentos alter column unidade_registro set not null;
create index estoque_movimentos_lote_idx on public.estoque_movimentos(lote_id) where lote_id is not null;
create index estoque_movimentos_atendimento_idx on public.estoque_movimentos(atendimento_id) where atendimento_id is not null;
create table public.estoque_baixas_lotes (
 movimento_id uuid not null references public.estoque_movimentos(id) on delete restrict,
 lote_id uuid not null references public.estoque_lotes(id) on delete restrict,
 quantidade numeric(12,3) not null check(quantidade>0),
 primary key(movimento_id,lote_id)
);
create index estoque_baixas_lote_idx on public.estoque_baixas_lotes(lote_id);

alter table public.estoque_lotes enable row level security;
alter table public.estoque_atendimentos enable row level security;
alter table public.estoque_listas_pacientes enable row level security;
alter table public.estoque_conversoes enable row level security;
alter table public.estoque_cadastros_operacoes enable row level security;
alter table public.estoque_baixas_lotes enable row level security;
revoke all on public.estoque_lotes,public.estoque_atendimentos,public.estoque_listas_pacientes,public.estoque_conversoes,public.estoque_cadastros_operacoes,public.estoque_baixas_lotes from public,anon,authenticated;
grant select,insert,update on public.estoque_lotes,public.estoque_atendimentos,public.estoque_listas_pacientes to service_role;
grant select,insert on public.estoque_conversoes,public.estoque_cadastros_operacoes,public.estoque_baixas_lotes to service_role;

create function public.kahenna_revisao_estoque() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.revisao=old.revisao+1;return new;end $$;
revoke all on function public.kahenna_revisao_estoque() from public,anon,authenticated;
grant execute on function public.kahenna_revisao_estoque() to service_role;
create trigger estoque_revisao before update on public.estoque_produtos for each row execute function public.kahenna_revisao_estoque();

create function public.kahenna_converter_embalagem(p_id uuid,p_produto uuid,p_unidade text,p_fator numeric,p_revisao bigint,p_usuario uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.estoque_produtos; c public.estoque_conversoes; q numeric;
begin
 if p_usuario is null or p_id is null then raise exception 'Responsável ou operação inválidos.';end if;
 select * into p from public.estoque_produtos where id=p_produto for update;
 if not found then raise exception 'Produto não encontrado.';end if;
 select * into c from public.estoque_conversoes where id=p_id;
 if found then
  if c.produto_id<>p_produto or c.unidade_nova<>p_unidade or c.fator<>p_fator or c.usuario_id is distinct from p_usuario then raise exception 'Operação já utilizada com outros dados.';end if;
  return to_jsonb(p);
 end if;
 if not p.ativo or p.unidade not in ('caixa','pacote','frasco') or p_unidade is null or p_unidade not in ('un','ml','g') or p_fator is null or p_fator<=0 or p_fator>999999.999 or p_fator<>round(p_fator,3) then raise exception 'Confira a unidade de uso e o conteúdo da embalagem.';end if;
 if p_revisao is null or p.revisao<>p_revisao then raise exception 'O estoque foi atualizado. Reabra o produto para conferir os valores.';end if;
 q=p.quantidade*p_fator;
 if q>999999999.999 or q<>round(q,3) or exists(select 1 from public.estoque_lotes where produto_id=p.id and (quantidade_inicial*p_fator>999999999.999 or quantidade_inicial*p_fator<>round(quantidade_inicial*p_fator,3) or quantidade_restante*p_fator<>round(quantidade_restante*p_fator,3))) then raise exception 'A conversão excede a precisão ou o limite de quantidade.';end if;
 insert into public.estoque_conversoes(id,produto_id,usuario_id,unidade_anterior,unidade_nova,fator,quantidade_anterior,quantidade_nova,valor_preservado) values(p_id,p.id,p_usuario,p.unidade,p_unidade,p_fator,p.quantidade,q,p.valor_estoque);
 update public.estoque_lotes set quantidade_inicial=quantidade_inicial*p_fator,quantidade_restante=quantidade_restante*p_fator where produto_id=p.id;
 update public.estoque_produtos set quantidade=q,unidade=p_unidade,embalagem_padrao=p.unidade,conteudo_padrao=p_fator where id=p.id returning * into p;
 return to_jsonb(p);
end $$;

create function public.kahenna_movimentar_estoque_v2(p_id uuid,p_produto uuid,p_dados jsonb,p_usuario uuid,p_atendimento uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.estoque_produtos; anterior public.estoque_movimentos; l public.estoque_lotes;
 tipo text; dia date; motivo text; fornecedor text; embalagem text; fator numeric; v_quantidade numeric; recebida numeric; valor numeric; custo numeric; restante numeric; retirar numeric; escolhido uuid; codigo text; vencimento date; novo_valor numeric;
begin
 if p_id is null or p_usuario is null or p_dados is null or jsonb_typeof(p_dados)<>'object' then raise exception 'Movimentação inválida.';end if;
 select * into p from public.estoque_produtos where id=p_produto for update;
 if not found then raise exception 'Produto não encontrado.';end if;
 select * into anterior from public.estoque_movimentos where id=p_id;
 if found then
  if anterior.dados_operacao is not null then
   if anterior.produto_id<>p_produto or anterior.dados_operacao<>p_dados or anterior.usuario_id is distinct from p_usuario or anterior.atendimento_id is distinct from p_atendimento then raise exception 'Esta identificação já foi usada em outra movimentação.';end if;
  else
   if p_dados->>'modo'<>'legado' or anterior.produto_id<>p_produto or anterior.tipo<>p_dados->>'tipo' or anterior.quantidade<>(p_dados->>'quantidade')::numeric or anterior.ocorrido_em<>(p_dados->>'ocorrido_em')::date or anterior.motivo<>p_dados->>'motivo' or anterior.fornecedor<>coalesce(p_dados->>'fornecedor','') or anterior.usuario_id is distinct from p_usuario or (anterior.tipo='entrada' and anterior.custo_unitario is distinct from (p_dados->>'custo_unitario')::numeric) then raise exception 'Esta identificação já foi usada em outra movimentação.';end if;
  end if;
  return to_jsonb(anterior);
 end if;
 tipo=p_dados->>'tipo';dia=(p_dados->>'ocorrido_em')::date;motivo=btrim(p_dados->>'motivo');fornecedor=coalesce(p_dados->>'fornecedor','');
 if tipo is null or tipo not in ('entrada','saida') or dia is null or dia<date '1900-01-01' or dia>(now() at time zone 'America/Sao_Paulo')::date or motivo is null or length(motivo) not between 1 and 300 or length(fornecedor)>120 then raise exception 'Confira a data e os detalhes da movimentação.';end if;
 if not p.ativo then raise exception 'Reative o produto antes de movimentar.';end if;
 if p_dados->>'modo'<>'legado' and ((p_dados->>'revisao') is null or p.revisao<>(p_dados->>'revisao')::bigint) then raise exception 'O estoque foi atualizado. Reabra o formulário para conferir os valores.';end if;
 recebida=(p_dados->>'quantidade')::numeric;
 if recebida is null or recebida<=0 or recebida>999999999.999 or recebida<>round(recebida,3) then raise exception 'Informe uma quantidade válida.';end if;
 if tipo='entrada' then
  embalagem=coalesce(p_dados->>'unidade_compra',p.unidade);fator=coalesce((p_dados->>'conteudo_embalagem')::numeric,1);
  if embalagem=p.unidade then fator=1;
  elsif embalagem='kg' and p.unidade='g' then fator=1000;
  elsif embalagem='l' and p.unidade='ml' then fator=1000;
  elsif embalagem not in ('caixa','pacote','frasco') then raise exception 'Unidade de compra incompatível com o produto.';end if;
  if p_dados->>'modo'<>'legado' and p.unidade not in ('un','ml','g') then raise exception 'Informe o conteúdo da embalagem para converter o cadastro para unidades de uso.';end if;
  if fator is null or fator<=0 or fator>999999.999 or fator<>round(fator,3) then raise exception 'Informe o conteúdo de cada embalagem.';end if;
  v_quantidade=recebida*fator;
  if v_quantidade>999999999.999 or v_quantidade<>round(v_quantidade,3) then raise exception 'Confira a quantidade de unidades recebidas.';end if;
  if p_dados->>'modo'='legado' then
   custo=(p_dados->>'custo_unitario')::numeric;
   if custo is null or custo<0 or custo>999999.9999 or custo<>round(custo,4) then raise exception 'Informe um custo unitário válido.';end if;
   valor=round(v_quantidade*custo,4);
  else
   valor=(p_dados->>'valor_total')::numeric;custo=(p_dados->>'custo_unitario')::numeric;
   if valor is null and custo is not null then valor=round(v_quantidade*custo,2);end if;
   if valor is null or valor<0 or valor>99999999999.99 or valor<>round(valor,2) or (custo is not null and (custo<0 or custo>99999999.99999999 or round(v_quantidade*custo,2)<>valor)) then raise exception 'Confira o valor total da compra e o custo unitário opcional.';end if;
   custo=valor/v_quantidade;
  end if;
  codigo=nullif(btrim(p_dados->>'lote'),'');vencimento=(p_dados->>'validade')::date;
  if length(codigo)>80 or (vencimento is not null and (vencimento<date '1900-01-01' or vencimento>date '2200-12-31')) then raise exception 'Confira lote e validade.';end if;
  if p.quantidade+v_quantidade>999999999.999 or p.valor_estoque+valor>99999999999999.9999 then raise exception 'Esta compra excede o limite de saldo do produto.';end if;
  insert into public.estoque_lotes(id,produto_id,codigo,validade,recebido_em,quantidade_inicial,quantidade_restante) values(p_id,p.id,codigo,vencimento,dia,v_quantidade,v_quantidade);
  update public.estoque_produtos set quantidade=p.quantidade+v_quantidade,valor_estoque=p.valor_estoque+valor,embalagem_padrao=case when embalagem<>p.unidade then embalagem else coalesce(p.embalagem_padrao,p.unidade) end,conteudo_padrao=case when embalagem<>p.unidade then fator else p.conteudo_padrao end where id=p.id;
  insert into public.estoque_movimentos(id,produto_id,tipo,quantidade,custo_unitario,valor_total,saldo_apos,ocorrido_em,motivo,fornecedor,usuario_id,unidade_registro,dados_operacao,lote_id)
   values(p_id,p.id,tipo,v_quantidade,custo,valor,p.quantidade+v_quantidade,dia,motivo,fornecedor,p_usuario,p.unidade,p_dados,p_id) returning * into anterior;
 else
  v_quantidade=recebida;escolhido=(p_dados->>'lote_id')::uuid;
  if v_quantidade>p.quantidade then raise exception 'Saldo insuficiente. Confira a quantidade disponível.';end if;
  custo=p.custo_medio;valor=case when v_quantidade=p.quantidade then p.valor_estoque else round(custo*v_quantidade,4) end;novo_valor=p.valor_estoque-valor;
  insert into public.estoque_movimentos(id,produto_id,tipo,quantidade,custo_unitario,valor_total,saldo_apos,ocorrido_em,motivo,fornecedor,usuario_id,unidade_registro,dados_operacao,lote_id,atendimento_id)
   values(p_id,p.id,tipo,v_quantidade,custo,valor,p.quantidade-v_quantidade,dia,motivo,'',p_usuario,p.unidade,p_dados,escolhido,p_atendimento) returning * into anterior;
  restante=v_quantidade;
  for l in select * from public.estoque_lotes where produto_id=p.id and quantidade_restante>0 and (escolhido is null or id=escolhido) and recebido_em<=dia and (validade is null or validade>=dia or (p_atendimento is null and p_dados->>'finalidade'='descarte')) order by validade nulls last,recebido_em,id for update loop
   retirar=least(restante,l.quantidade_restante);
   update public.estoque_lotes set quantidade_restante=quantidade_restante-retirar where id=l.id;
   insert into public.estoque_baixas_lotes(movimento_id,lote_id,quantidade) values(p_id,l.id,retirar);
   restante=restante-retirar;exit when restante=0;
  end loop;
  if restante>0 then raise exception 'Saldo insuficiente nos lotes válidos para essa data. Confira lote, validade e quantidade.';end if;
  update public.estoque_produtos set quantidade=p.quantidade-v_quantidade,valor_estoque=novo_valor where id=p.id;
 end if;
 return to_jsonb(anterior);
end $$;

-- Compatibility for older open clients: every new movement still updates batches.
create or replace function public.kahenna_movimentar_estoque(p_id uuid,p_produto uuid,p_tipo text,p_quantidade numeric,p_custo numeric,p_data date,p_motivo text,p_fornecedor text,p_usuario uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select public.kahenna_movimentar_estoque_v2(p_id,p_produto,jsonb_build_object('modo','legado','tipo',p_tipo,'quantidade',p_quantidade,'custo_unitario',p_custo,'ocorrido_em',p_data,'motivo',p_motivo,'fornecedor',coalesce(p_fornecedor,'')),p_usuario);
$$;

create function public.kahenna_salvar_produto_estoque(p_id uuid,p_produto uuid,p_novo boolean,p_dados jsonb,p_usuario uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.estoque_produtos; anterior public.estoque_cadastros_operacoes; cadastro jsonb; compra jsonb; conversao jsonb; resposta jsonb; mov jsonb; dados jsonb;
begin
 if p_id is null or p_produto is null or p_novo is null or p_usuario is null or p_dados is null then raise exception 'Cadastro inválido.';end if;
 perform pg_advisory_xact_lock(hashtextextended('kahenna-cadastro:'||p_id::text,0));
 dados=jsonb_build_object('novo',p_novo,'produto',p_produto,'dados',p_dados);
 select * into anterior from public.estoque_cadastros_operacoes where id=p_id;
 if found then
  if anterior.usuario_id is distinct from p_usuario or anterior.dados<>dados then raise exception 'Operação já utilizada com outros dados.';end if;
  return anterior.resultado;
 end if;
 cadastro=p_dados->'cadastro';compra=p_dados->'compra';conversao=p_dados->'conversao';
 if cadastro is null or length(btrim(cadastro->>'nome')) not between 1 and 120 or length(coalesce(nullif(btrim(cadastro->>'categoria'),''),'Outros'))>60 or coalesce((cadastro->>'estoque_minimo')::numeric,-1)<0 or (cadastro->>'estoque_minimo')::numeric>999999.999 or (cadastro->>'estoque_minimo')::numeric<>round((cadastro->>'estoque_minimo')::numeric,3) then raise exception 'Confira os dados do produto.';end if;
 if p_novo then
  if cadastro->>'unidade' is null or cadastro->>'unidade' not in ('un','ml','g') then raise exception 'Escolha a unidade de uso do produto.';end if;
  insert into public.estoque_produtos(id,nome,categoria,unidade,estoque_minimo,embalagem_padrao) values(p_produto,btrim(cadastro->>'nome'),coalesce(nullif(btrim(cadastro->>'categoria'),''),'Outros'),cadastro->>'unidade',(cadastro->>'estoque_minimo')::numeric,cadastro->>'unidade') returning * into p;
 else
  select * into p from public.estoque_produtos where id=p_produto for update;
  if not found or not p.ativo then raise exception 'Produto não encontrado.';end if;
  if p.revisao is distinct from (p_dados->>'revisao')::bigint then raise exception 'O estoque foi atualizado. Reabra o produto para conferir os valores.';end if;
  update public.estoque_produtos set nome=btrim(cadastro->>'nome'),categoria=coalesce(nullif(btrim(cadastro->>'categoria'),''),'Outros'),estoque_minimo=(cadastro->>'estoque_minimo')::numeric where id=p.id returning * into p;
 end if;
 if conversao is not null and conversao<>'null'::jsonb then
  perform public.kahenna_converter_embalagem(p_id,p.id,conversao->>'unidade',(conversao->>'fator')::numeric,p.revisao,p_usuario);
  select * into p from public.estoque_produtos where id=p_produto;
 end if;
 if compra is not null and compra<>'null'::jsonb then
  mov=public.kahenna_movimentar_estoque_v2(p_id,p.id,compra||jsonb_build_object('modo','novo','tipo','entrada','revisao',p.revisao),p_usuario);
 end if;
 select * into p from public.estoque_produtos where id=p_produto;
 resposta=jsonb_build_object('produto',to_jsonb(p),'movimento',mov);
 insert into public.estoque_cadastros_operacoes(id,produto_id,usuario_id,dados,resultado) values(p_id,p.id,p_usuario,dados,resposta);
 return resposta;
end $$;

create function public.kahenna_salvar_lista_materiais(p_paciente uuid,p_itens jsonb,p_usuario uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item jsonb; itens jsonb='[]'::jsonb; p public.estoque_produtos; q numeric;
begin
 if p_usuario is null or p_itens is null or jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens)>30 then raise exception 'Lista de materiais inválida.';end if;
 perform 1 from public.visitantes where visitante_id=p_paciente for key share;
 if not found then raise exception 'Paciente não encontrado.';end if;
 if (select count(*) from jsonb_array_elements(p_itens))<>(select count(distinct x->>'produto_id') from jsonb_array_elements(p_itens) x) then raise exception 'Escolha cada produto uma única vez.';end if;
 for item in select * from jsonb_array_elements(p_itens) loop
  select * into p from public.estoque_produtos where id=(item->>'produto_id')::uuid;
  q=(item->>'quantidade')::numeric;
  if not found or not p.ativo or p.unidade not in ('un','ml','g') or q is null or q<=0 or q>999999999.999 or q<>round(q,3) then raise exception 'Confira os produtos e as quantidades da lista.';end if;
  itens=itens||jsonb_build_array(jsonb_build_object('produto_id',p.id,'quantidade',q,'unidade',p.unidade));
 end loop;
 insert into public.estoque_listas_pacientes(paciente_id,itens,atualizado_por) values(p_paciente,itens,p_usuario)
 on conflict(paciente_id) do update set itens=excluded.itens,atualizado_por=excluded.atualizado_por,atualizado_em=now();
 return itens;
end $$;

create function public.kahenna_registrar_materiais_atendimento(p_id uuid,p_paciente uuid,p_descricao text,p_data date,p_itens jsonb,p_salvar_padrao boolean,p_usuario uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare anterior public.estoque_atendimentos; item jsonb; p public.estoque_produtos; d jsonb; dados jsonb; m jsonb; total numeric=0; linhas jsonb='[]'::jsonb;
begin
 if p_id is null or p_usuario is null or p_data is null or p_data<date '1900-01-01' or p_data>(now() at time zone 'America/Sao_Paulo')::date or length(btrim(coalesce(p_descricao,''))) not between 1 and 200 or p_itens is null or jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens) not between 1 and 30 then raise exception 'Confira o paciente, a data e os materiais do atendimento.';end if;
 perform pg_advisory_xact_lock(hashtextextended('kahenna-atendimento:'||p_id::text,0));
 dados=jsonb_build_object('paciente',p_paciente,'descricao',btrim(p_descricao),'data',p_data,'itens',p_itens,'salvar_padrao',coalesce(p_salvar_padrao,false));
 select * into anterior from public.estoque_atendimentos where id=p_id;
 if found then
  if anterior.dados_operacao<>dados or anterior.usuario_id is distinct from p_usuario then raise exception 'Operação já utilizada com outros dados.';end if;
  select coalesce(jsonb_agg(to_jsonb(mov)),'[]'::jsonb) into linhas from public.estoque_movimentos mov where mov.atendimento_id=p_id;
  return jsonb_build_object('atendimento',to_jsonb(anterior),'itens',linhas);
 end if;
 perform 1 from public.visitantes where visitante_id=p_paciente for key share;
 if not found then raise exception 'Paciente não encontrado.';end if;
 if (select count(*) from jsonb_array_elements(p_itens))<>(select count(distinct x->>'produto_id') from jsonb_array_elements(p_itens) x) then raise exception 'Escolha cada produto uma única vez.';end if;
 -- All overlapping attendances acquire product locks in the same order.
 perform 1 from public.estoque_produtos where id in (select (x->>'produto_id')::uuid from jsonb_array_elements(p_itens) x) order by id for update;
 insert into public.estoque_atendimentos(id,paciente_id,descricao,ocorrido_em,usuario_id,dados_operacao) values(p_id,p_paciente,btrim(p_descricao),p_data,p_usuario,dados) returning * into anterior;
 for item in select * from jsonb_array_elements(p_itens) loop
  select * into p from public.estoque_produtos where id=(item->>'produto_id')::uuid;
  if not found or not p.ativo or p.unidade not in ('un','ml','g') then raise exception 'Confira os materiais e a unidade de uso de cada produto.';end if;
  d=jsonb_build_object('modo','novo','tipo','saida','quantidade',item->'quantidade','ocorrido_em',p_data,'motivo','Atendimento: '||btrim(p_descricao),'fornecedor','','revisao',item->'revisao','lote_id',item->'lote_id');
  m=public.kahenna_movimentar_estoque_v2(gen_random_uuid(),p.id,d,p_usuario,p_id);
  total=total+(m->>'valor_total')::numeric;linhas=linhas||jsonb_build_array(m);
 end loop;
 update public.estoque_atendimentos set custo_total=total where id=p_id returning * into anterior;
 if p_salvar_padrao then perform public.kahenna_salvar_lista_materiais(p_paciente,p_itens,p_usuario);end if;
 return jsonb_build_object('atendimento',to_jsonb(anterior),'itens',linhas);
end $$;

revoke all on function public.kahenna_converter_embalagem(uuid,uuid,text,numeric,bigint,uuid),public.kahenna_movimentar_estoque_v2(uuid,uuid,jsonb,uuid,uuid),public.kahenna_movimentar_estoque(uuid,uuid,text,numeric,numeric,date,text,text,uuid),public.kahenna_salvar_produto_estoque(uuid,uuid,boolean,jsonb,uuid),public.kahenna_salvar_lista_materiais(uuid,jsonb,uuid),public.kahenna_registrar_materiais_atendimento(uuid,uuid,text,date,jsonb,boolean,uuid) from public,anon,authenticated;
grant execute on function public.kahenna_converter_embalagem(uuid,uuid,text,numeric,bigint,uuid),public.kahenna_movimentar_estoque_v2(uuid,uuid,jsonb,uuid,uuid),public.kahenna_movimentar_estoque(uuid,uuid,text,numeric,numeric,date,text,text,uuid),public.kahenna_salvar_produto_estoque(uuid,uuid,boolean,jsonb,uuid),public.kahenna_salvar_lista_materiais(uuid,jsonb,uuid),public.kahenna_registrar_materiais_atendimento(uuid,uuid,text,date,jsonb,boolean,uuid) to service_role;
do $$ begin
 if exists((select * from kahenna_saldos_antes except select id,nome,categoria,unidade,estoque_minimo,quantidade,valor_estoque,ativo from public.estoque_produtos) union all (select id,nome,categoria,unidade,estoque_minimo,quantidade,valor_estoque,ativo from public.estoque_produtos except select * from kahenna_saldos_antes)) then raise exception 'A atualização alterou um saldo existente.';end if;
 if exists((select * from kahenna_movimentos_antes except select id,produto_id,tipo,quantidade,custo_unitario,valor_total,saldo_apos,ocorrido_em,motivo,fornecedor,usuario_id from public.estoque_movimentos) union all (select id,produto_id,tipo,quantidade,custo_unitario,valor_total,saldo_apos,ocorrido_em,motivo,fornecedor,usuario_id from public.estoque_movimentos except select * from kahenna_movimentos_antes)) then raise exception 'A atualização alterou o histórico existente.';end if;
end $$;
notify pgrst,'reload schema';
commit;
