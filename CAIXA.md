# Caixa da clínica

Compras e despesas manuais substituem o painel principal de estoque. As entradas são lidas dos recebimentos financeiros dos pacientes e dos valores antigos em conversões, com o mesmo critério usado pela Visão Geral. Compras antigas de produtos ativos permanecem visíveis, sem duplicação ou migração dos registros originais. Os materiais clínicos e o histórico anterior continuam disponíveis pela ficha do paciente.

O resultado mensal é entradas menos reembolsos, taxas de cartão e pagamentos de compras/despesas. Recebimentos parcelados entram integralmente no mês do registro: não representa calendário de liquidação bancária. Reembolsos reduzem o bruto, mas não devolvem automaticamente a taxa da operadora.

Novos recebimentos exigem canal e bandeira para cartão. Débito é da maquininha; crédito permite de 1 a 6 parcelas sem juros ao paciente. A clínica absorve a taxa, calculada no servidor e congelada por lançamento. Alterar a tabela não recalcula históricos. Recebimentos antigos sem taxa informada aparecem no alerta de pendências; não estimamos retroativamente valores desconhecidos.

Taxas iniciais transcritas das imagens fornecidas em 07/11/2026: maquininha/InfiniteTap Visa e Mastercard; Elo e Amex; link de pagamento dessas quatro bandeiras. Outras bandeiras exigem configuração antes de registrar. Não há acréscimo ao preço do paciente.

A migração `20261107230414_caixa_clinica_taxas.sql` cria tabelas com RLS, RPCs invoker acessíveis somente ao backend e colunas adicionais sem alterar saldos históricos. Edição usa revisão otimista; cadastro e exclusão toleram repetição de requisição. Exclusões retiram gastos dos totais sem apagar definitivamente o histórico original.

Validação local: `node --test tests/*.test.js tests/recuperacao-local.test.cjs` e `node tests/caixa-browser.cjs`. A prévia usa exclusivamente PostgreSQL local em memória e pacientes fictícios, sem conectar ao banco real.
