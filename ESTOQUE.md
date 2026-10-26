# Estoque da clínica

A aba Estoque é restrita a administradores ativos. Cadastrar produto não cria saldo: a entrada ocorre em Registrar compra, com quantidade, custo por unidade e data. Registrar uso baixa a quantidade e calcula o custo pelo custo médio móvel. É possível informar uma observação para consumo, perda ou outro motivo. O resumo separa valor atual em estoque, compras do mês escolhido, custo das baixas no mês e produtos para repor.

## Unidade e custos

Escolher uma unidade de controle por produto (unidade, caixa, frasco, pacote, ml ou g). Quantidades podem ter até três casas decimais, e o custo de compra por unidade, quatro. Não há conversão entre caixa e unidade. Por exemplo, se o produto é controlado em unidades, uma caixa com 100 unidades é uma entrada de 100 unidades, usando o custo de uma unidade. A unidade é fixa após o cadastro para preservar o sentido do histórico.

Custo médio = valor do saldo / quantidade disponível. Compras acrescentam valor; baixas usam a média corrente. A baixa de todo o saldo retira exatamente o valor restante, sem resíduo de arredondamento. Datas retroativas classificam a movimentação no mês escolhido; o custo médio é calculado na ordem em que os registros são feitos. Compras registradas não equivalem a pagamentos conciliados ou parcelamentos, e esta aba não altera a receita dos atendimentos.

Produtos zerados podem ser arquivados e reativados, conservando o histórico. Movimentações já registradas não são editadas nem apagadas pela interface. Não há baixa automática vinculada a agendamentos nesta versão.

## Banco e segurança

Aplicar a migração gerada pelo CLI `supabase/migrations/20261026130322_estoque.sql` uma única vez no projeto exclusivo Kahenna. Não reaplicar schema.sql nem executar no Atlas. As novas tabelas têm RLS e nenhuma permissão para anon/authenticated; o servidor privado autoriza os administradores. As funções são SECURITY INVOKER e têm search_path fixo.

A função de movimentação trava a linha do produto, valida saldo, registra o histórico e atualiza quantidade/valor em uma transação. A mesma identificação de requisição retorna a operação original sem repetir o movimento. A interface conserva essa identificação ao repetir o envio no mesmo formulário e bloqueia cliques durante o salvamento. Não existe operação de exclusão de produtos ou movimentos no módulo.

## Validação

`npm test`: validação de produto, precisão/data/unidade, campos permitidos, identidade da sessão e autorização das rotas, junto à regressão dos PDFs e aniversários.

`tests/estoque-db.sql`: teste transacional com ROLLBACK no banco real, no papel service_role. Confere média móvel, custo de consumo, idempotência, bloqueio de saldo negativo, impedimento de arquivamento com saldo, saldo zerado sem resíduos, proteção de produto arquivado e resumo mensal.

`tests/estoque-preview.cjs`: prévia local com dados exclusivamente fictícios. Não é importada pelo servidor de produção. Os testes de interface com compras, uso e arquivamento devem usar essa prévia para não misturar valores fictícios aos gastos reais.
