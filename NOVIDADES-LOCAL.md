# Novidades em preparação local

Este trabalho não foi publicado. Nenhuma migração nova foi executada em produção. O checkout usado para publicação permanece separado desta pasta de implementação.

## Prévia

Execute `node tests/novidades-preview.cjs` e abra `http://127.0.0.1:3110/leads.html?paciente=11111111-1111-4111-8111-111111111111`.

O servidor escuta exclusivamente em 127.0.0.1 e usa PostgreSQL em memória (PGlite), dados fictícios e uma simulação da interface de armazenamento privado. Não acessa credenciais reais nem Supabase/S3 de produção. Os cadastros da prévia são reiniciados quando o processo encerra. Essa autenticação fictícia pertence somente ao arquivo de teste; o servidor oficial continua usando os middlewares reais de autenticação e autorização.

## Funcionalidades

- Ficha do paciente: visual mais leve, bordô suave, cartões uniformes e acesso a planejamento facial e fotos de evolução.
- Mapa facial: ilustração SVG própria com frente e perfis, pontos e linhas, edição, remoção, produto/procedimento/quantidade/unidade, lote, validade e observações. Quantidades e posições são definidas pela profissional; não há recomendação clínica automática, conversão entre unidades de toxinas ou baixa automática do estoque. O resumo agrupa por nome de produto e unidade.
- Mapas são salvos por paciente e data, com estado planejado/realizado, revisão otimista e auditoria contendo a versão anterior nas alterações. Alterações ainda não salvas impedem trocar ou fechar o mapa sem salvar ou descartar.
- Fotos JPEG/PNG: reprocessamento no servidor para JPEG, remoção de metadados, limite de 24 megapixels/8 MB na entrada e até 2000 px na saída, armazenamento privado, verificação SHA-256 e auditoria de leitura. Comparação de duas fotos com seleção de data/vista. As consultas mostram até 200 registros recentes por paciente.
- Compras: importação de NF-e XML, PDF com texto, PDF digitalizado e foto via Tesseract local. Os arquivos são lidos no navegador; o OCR e seu idioma português são servidos pelo próprio aplicativo e carregados somente quando necessários. Não há serviço de IA externo ou cobrança por reconhecimento. Limites: arquivo de até 10 MB, PDF de até 10 páginas, foto de até 24 megapixels e até 100 itens.
- XML fornece dados estruturados; leitura de texto/foto usa reconhecimento e heurísticas e pode exigir correção manual. A confirmação humana é obrigatória. Campos de lote e validade ausentes ficam vazios. O importador não consulta autorização fiscal na Sefaz.
- A compra confirmada gera um único gasto com os itens detalhados, evitando dupla contagem. Duplicação é bloqueada por chave NF-e ou hash do arquivo; nota excluída pode ser importada novamente para restaurar o lançamento sem duplicá-lo. A data é a data do pagamento conferida pelo usuário. O valor pago pode incluir frete, desconto e outros ajustes.
- Fornecedores: cadastro/edição de contato, telefone, e-mail, categoria, observações e situação ativo/inativo; busca sem acentos, paginação, ações de contato. Fornecedores ativos são sugeridos nos campos de compra/importação.
- Arquivos da clínica: biblioteca por título/categoria, busca sem acentos, paginação e download privado de PDF, Word (.docx), JPEG e PNG, até 15 MB por arquivo. Imagens são normalizadas e o download é anexo com MIME restrito, verificação de integridade e auditoria. Documentos específicos de pacientes continuam no prontuário individual.
- Novo menu com seis seções principais; em telas pequenas, navegação em duas linhas e botão Sair disponível.

## Validação

`node --test tests/*.test.js tests/recuperacao-local.test.cjs`

`node tests/novidades-browser.cjs`

Os testes de navegador usam Edge/Chromium, bloqueiam destinos externos e percorrem salvamento/edição do mapa, fotos, fornecedores, arquivo privado, XML/PDF/OCR e larguras de 360 a 1440 px. Incluem o shell com iframe utilizado no CRM.

## Para a publicação futura

As migrações ainda pendentes são `20261108130900_planejamento_facial_fotos_notas.sql` e `20261108132000_fornecedores_arquivos_clinica.sql`. Criam tabelas com RLS, RPCs invoker restritos ao backend e buckets privados `kahenna-evolucao` e `kahenna-arquivos`. Os arquivos não usam o bucket público nem tornam documentos existentes públicos.

Antes do deploy autorizado, confirmar a criação privada desses buckets e testar upload/download com a configuração real, sem usar dados de pacientes como teste. Incluir as novas tabelas e os dois novos buckets na rotina de backup; o arquivamento S3 já existente dos PDFs de pacientes é um fluxo separado. Esta etapa não foi executada porque a solicitação atual limita as alterações ao ambiente local.

## Refinamentos e orçamento

- Mapa por procedimento: selecionar toxina/preenchimento/fios, tocar nos pontos e informar somente a quantidade no mini popup. Produto e rastreio ficam opcionais e podem ser definidos no painel. Zoom e perfis mantêm as coordenadas normalizadas. Fechamento com mudanças permite salvar, descartar ou continuar, sem exigir preencher um ponto vazio.
- Seletores de arquivo substituem os botões nativos por controles consistentes, com foco de teclado, nome selecionado e estado de envio.
- Fornecedores em lista de contatos; Arquivos em três colunas no computador, com cartões suaves. Pacientes usam iniciais (Gustavo Vieira Santos → GV).
- Início: fluxo de caixa mensal à esquerda (entradas líquidas, saídas e saldo), aniversários menores à direita na mesma linha. Sem textos explicativos nos totais do Caixa.
- Agenda: popup ancorado ao horário selecionado, mantendo os dados existentes e horários inteiros. Escape fecha; Tab permanece no formulário aberto.
- Orçamentos: cadastro e seleção de procedimentos, quantidades/ml, pagamento dividido em até cinco partes, cartão até 6x com taxas absorvidas pela clínica. Procedimentos → Pagamento → Concluir. O orçamento em aberto não entra no caixa. Concluir grava os recebimentos financeiros do paciente em uma transação, com operações idempotentes por orçamento/parcela de pagamento. Falha em uma taxa ou pagamento desfaz a operação inteira, sem lançamentos parciais.
- Tabela informada pelo usuário: toxina botulínica R$ 750/procedimento; preenchimento labial R$ 550/ml; preenchimento de nariz R$ 750/ml. Histórico conserva o preço registrado mesmo se a tabela mudar. Taxas são congeladas no recebimento, não repassadas ao paciente.
- Migração também pendente: 20261108141317_orcamentos_procedimentos_recebimento.sql. Incluir procedimentos_precos, orcamentos_pacientes e orcamento_recebimentos no backup.
- Validação adicional: node tests/orcamentos-browser.cjs e tests/orcamentos.test.js.


Orçamentos: formulário único com paciente, procedimentos e pagamentos na mesma rolagem; sem nome ou etapas. Valores editáveis em configuração separada na seção. Concluir abre conferência compacta e somente Confirmar e concluir registra Financeiro e Caixa. Teste de navegador cobre ausência de lançamento antes da confirmação, divisão Pix/cartão 6x, taxas, repetição e abertura pelo histórico. 45 testes automatizados aprovados. Alterações somente locais.

Conclusão do orçamento agora marca atendido somente um agendamento ativo do mesmo paciente, no mesmo dia em São Paulo, já iniciado e com menos de uma hora. Cancelados, futuros, já atendidos ou correspondências ambíguas ficam intactos. Operação dentro da transação do recebimento e protegida contra repetição. Histórico, seleções e uploads padronizados; atalhos com SVG próprio. Testes locais de banco, navegador e limites 360–1440 px aprovados.

08/11/2026: publicação autorizada e migrações aplicadas no projeto Kahenna Gestão. Revisão móvel adicional em 360×800, 390×844, 768×1024, 1024×768, 844×390 e 1366×900: abas, novo paciente, histórico, ações em popup (agendar, editar, financeiro e orçamento), mapa/fotos, Caixa, taxas, nota, fornecedores e arquivos. Áreas de toque ampliadas e botões iniciais aguardam inicialização. Testes locais sem gravação financeira; produção conferida sem criar pacientes ou pagamentos fictícios.

Início: cadastro rápido usa o mesmo formulário de Pacientes em popup; agenda de hoje compacta ao lado dos novos agendamentos do mês. Visão mensal mostra hoje em diante, oculta atendidos e separa retornos em seleção própria. Orçamento e materiais permitem buscar o paciente sem acentos, com seleção por teclado/toque. Lista de pacientes inclui próximo agendamento ativo e futuro. Cartão visual de acesso restrito removido. Testes: 47 automatizados, atalhos-pacientes-browser e bateria móvel. Sem alteração de estrutura do banco.
