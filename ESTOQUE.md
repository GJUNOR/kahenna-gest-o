# Estoque da clínica

A aba Estoque é restrita a administradores ativos. Produto e compra inicial podem ser salvos juntos, ou o cadastro pode começar sem saldo. Registrar uso baixa a quantidade e calcula o custo pelo custo médio móvel. É possível informar uma observação para consumo, perda ou outro motivo. O resumo separa valor atual em estoque, compras do mês escolhido, custo das baixas no mês e produtos para repor.

## Unidade e custos

Novos produtos usam unidade, ml ou g. Compras aceitam caixas, pacotes e frascos com conteúdo informado, além de litros e quilos quando compatíveis. Quantidades têm até três casas decimais; o total pago fica em centavos e o custo calculado preserva a precisão da divisão. A conversão dos cadastros antigos por embalagem exige confirmação do conteúdo e mantém o histórico original.

Custo médio = valor do saldo / quantidade disponível. Compras acrescentam valor; baixas usam a média corrente. A baixa de todo o saldo retira exatamente o valor restante, sem resíduo de arredondamento. Datas retroativas classificam a movimentação no mês escolhido; o custo médio é calculado na ordem em que os registros são feitos. Compras registradas não equivalem a pagamentos conciliados ou parcelamentos, e esta aba não altera a receita dos atendimentos.

Produtos podem ser excluídos da lista ativa mesmo com saldo, com confirmação, sem aba de excluídos na interface. É possível cadastrar outro produto com o mesmo nome; o novo cadastro começa com saldo zero e um identificador próprio. Saldo, custo e histórico são preservados; a exclusão não estorna compras ou usos do mês. Movimentações já registradas não são editadas nem apagadas pela interface. Não há baixa automática vinculada a agendamentos nesta versão.

## Banco e segurança

Aplicar a migração gerada pelo CLI `supabase/migrations/20261026130322_estoque.sql` uma única vez no projeto exclusivo Kahenna. Não reaplicar schema.sql nem executar no Atlas. As novas tabelas têm RLS e nenhuma permissão para anon/authenticated; o servidor privado autoriza os administradores. As funções são SECURITY INVOKER e têm search_path fixo.

A função de movimentação trava a linha do produto, valida saldo, registra o histórico e atualiza quantidade/valor em uma transação. A mesma identificação de requisição retorna a operação original sem repetir o movimento. A interface conserva essa identificação ao repetir o envio no mesmo formulário e bloqueia cliques durante o salvamento. A exclusão de produto é recuperável (ativo=false), restrita a administradores. Não há exclusão física nem remoção de movimentos. Aplicar também a migração 20261103013557_estoque_exclusao_recuperavel.sql.

## Validação

`npm test`: validação de produto, precisão/data/unidade, campos permitidos, identidade da sessão e autorização das rotas, junto à regressão dos PDFs e aniversários.

`tests/estoque-db.sql`: teste transacional com ROLLBACK no banco real, no papel service_role. Confere média móvel, custo de consumo, idempotência, bloqueio de saldo negativo, exclusão e restauração com saldo, saldo zerado sem resíduos, proteção de produto arquivado e resumo mensal.

`tests/estoque-integrado-preview.cjs`: prévia local com PostgreSQL e dados exclusivamente fictícios. Não é importada pelo servidor de produção. Os testes de interface devem usar essa prévia para não misturar valores fictícios aos gastos reais.

## Compras, embalagens e materiais por atendimento

Em Novo produto, **Cadastro rápido** oferece modelos de descartáveis com nome, categoria e embalagem preenchidos. Quantidade, conteúdo, preço, lote e validade não são presumidos. Caso já exista um produto com o mesmo nome, **Adicionar compra** reutiliza o cadastro dentro do mesmo pop-up. Para outros materiais, selecione **Personalizado** e preencha a unidade de uso, lote e validade conforme o produto. Os campos de rastreabilidade não constituem, por si sós, certificação de conformidade jurídica.

O cadastro e a compra inicial ficam em um único diálogo e são gravados pela mesma transação (`POST /api/estoque/cadastros`). A compra também pode ser desmarcada para cadastrar sem saldo. O identificador da operação impede duplicação em reenvios.

Informe quantidade comprada, embalagem e conteúdo por embalagem. O valor total da compra calcula o custo por unidade de uso (`un`, `ml` ou `g`); custo manual é opcional. Caixas, pacotes e frascos podem ter qualquer conteúdo informado; litros e quilos convertem em 1.000 ml/g. Lote, validade e fornecedor são opcionais.

Cadastros antigos controlados por embalagem mantêm saldo e valor. Ao editar ou comprar, a conversão para unidade de uso exige informar explicitamente o conteúdo da embalagem no mesmo diálogo. A conversão preserva o valor e as unidades dos movimentos históricos. Confira também o estoque mínimo na nova unidade.

Em **Registrar atendimento**, escolha o paciente e monte sua lista padrão. **Salvar somente a lista** não movimenta estoque. Antes de **Confirmar uso**, ajuste quantidades, acrescente ou retire materiais. A confirmação registra todos os consumos juntos, calcula o custo médio real e opcionalmente atualiza a lista padrão daquele paciente. Falta de saldo, lote vencido ou revisão desatualizada cancela toda a baixa. A lista não representa prescrição clínica.

Lotes válidos saem pela validade mais próxima; saldo anterior tem lote desconhecido e nenhuma validade presumida. O custo usa a média ponderada do produto. Perdas e vencidos podem ser baixados como **Perda ou descarte** em **Usar**. O custo dos materiais não cria cobrança nem altera o financeiro do paciente.

Teste local integrado: `node tests/estoque-integrado-preview.cjs` (porta 3102, banco PostgreSQL temporário via PGlite, somente dados fictícios). Testes: `npm test`. A migração `20261103023124_estoque_compras_lotes_atendimentos.sql` inclui comparação automática dos saldos e do histórico anterior; qualquer diferença aborta a atualização.

