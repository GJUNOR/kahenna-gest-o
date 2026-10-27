# Conferência e arquivamento dos PDFs

Implementação local: os arquivos digitalizados são enviados a um bucket privado do Supabase e aparecem em **Para conferir** na ficha do paciente. Somente administradores ativos podem acessar documentos. Não existe rotina de sete dias nem transferência automática.

Ao abrir **Conferir PDF**, o navegador confere o SHA-256 dos bytes e mostra as páginas com PDF.js. O usuário percorre as páginas e confirma legibilidade, completude, assinatura e paciente correto. O botão **Finalizar e arquivar** transfere esse arquivo exato ao S3. Não há edição ou certificação de assinatura.

## Garantias do fluxo

- Cada envio recebe um UUID novo; arquivos anteriores não são sobrescritos.
- S3 exige bloqueio de acesso público e versionamento ativados. A gravação usa chave exclusiva, condição de não sobrescrita, checksum e SSE-S3.
- O servidor recupera a versão exata no S3 e compara tamanho e SHA-256 antes de registrar o arquivamento.
- Registro de destino, versão S3, responsável, data e auditoria são persistidos em uma transação no Postgres.
- Somente após o registro e nova verificação o servidor remove a cópia temporária do Supabase Storage.
- Se houver falha antes do commit, o PDF permanece pendente no Supabase. Uma cópia S3 eventualmente já gravada é reutilizada na repetição.
- Se a limpeza falhar, o documento permanece arquivado e a cópia temporária é preservada. Abra-o em **Arquivados**, confirme e use **Liberar cópia temporária** para repetir a limpeza.
- Consultas de arquivos finalizados usam a versão S3 registrada, com autenticação, auditoria e verificação de integridade. Chaves de acesso e localização S3 não são enviadas ao navegador.
- Documentos antigos que só estão no Supabase passam a ser apresentados como pendentes; não são arquivados automaticamente.

## Preparação para implantação

1. Fazer backup do banco e dos arquivos existentes. Confirmar que este é o projeto exclusivo da Kahenna.
2. Confirmar que `database/schema.sql` e `database/documentos-privados.sql` já foram aplicados. **Não executar esses scripts novamente em um projeto já configurado.**
3. Revisar e aplicar somente a migração `supabase/migrations/20261026153721_documentos_conferencia_financeiro.sql`. Ela inclui documentos e correções financeiras. A migração não foi aplicada ao projeto online por esta implementação.
4. Criar credenciais dedicadas ao CRM usando `config/s3-policy.example.json`, substituindo `SUBSTITUA_PELO_BUCKET` pelo bucket real nos dois ARNs. Não usar credenciais da conta raiz. Não conceder DeleteObject, DeleteObjectVersion, acesso a outros buckets ou alteração das proteções.
5. No ambiente do servidor (Render), preencher `AWS_REGION=us-east-2`, `KAHENNA_S3_BUCKET`, `AWS_ACCESS_KEY_ID` e `AWS_SECRET_ACCESS_KEY`. Para credenciais temporárias, incluir também `AWS_SESSION_TOKEN` e providenciar renovação. Nunca colocar esses valores no frontend ou repositório. `.env.example` contém apenas campos vazios e exemplos locais.
6. Manter as variáveis Supabase existentes, `NODE_ENV=production`, `SITE_URL` e `ALLOWED_ORIGINS` com as origens exatas utilizadas. Preservar bloqueio de acesso público e versionamento no S3.
7. Instalar via `npm ci` e publicar via `npm ci --omit=dev` / `npm start`. Código e migração financeira devem entrar juntos para que os novos RPCs e identificadores de operação estejam disponíveis.
8. Testar com PDF fictício no ambiente publicado: upload pendente, visualização de todas as páginas, finalizar, consulta e download. Confirmar a remoção da cópia temporária e a existência do registro de versão no banco.
9. Configurar backup independente e recuperação dos PDFs e do índice que os relaciona aos pacientes. Nem o backup do banco Supabase nem o versionamento S3, isoladamente, substituem esse backup. Durante a conferência, preservar também o papel original e a digitalização de origem conforme o procedimento da clínica.
10. Antes de pacientes reais, revisar continuidade da conta AWS após o plano gratuito e os procedimentos de digitalização/guarda com a assessoria jurídica. O botão Finalizar não é assinatura digital nem certificação jurídica.

## Correções iniciadas nesta entrega

- Nova consulta deixa de sobrescrever automaticamente a última consulta do paciente. Reagendamento exige o ID explícito de um agendamento ativo daquele paciente. Horários concorrentes bloqueados pelo índice único retornam conflito.
- Pagamento e alteração do status do paciente são atômicos, em um único RPC.
- Reembolso bloqueia o recebimento original enquanto calcula o saldo e insere, impedindo ultrapassagem por solicitações concorrentes.
- Operações financeiras recebem UUID de idempotência; repetição do mesmo UUID retorna o registro anterior e rejeita conteúdo divergente. A interface conserva esse UUID durante tentativas da mesma operação na página; recarregar/fechar a página perde as tentativas em memória, portanto conferir o histórico antes de reenviar após essa situação.
- Logout revoga a sessão de refresh no Supabase além de remover cookies. JWTs de acesso já emitidos ainda podem durar até sua expiração; revogação imediata estrita de JWT exige validação adicional de sessão.
- Cookies malformados são ignorados; atualização de senha exige usuário com perfil ativo; respostas de falhas internas de agenda/financeiro/pacientes/conversões deixam de expor a mensagem bruta do banco.
- Cabeçalhos globais de nosniff, enquadramento same-origin e referrer policy.

## Pontos da auditoria ainda pendentes

Esta entrega não é uma certificação de produção. Permanecem paginação e agregações completas nas listagens/resumos antigos, revisão dos endpoints legados de conversões e da possível dupla contabilização histórica, CSP global, ampliação da auditoria além de documentos, limites distribuídos para múltiplas instâncias, prontidão do banco/Storage no health check, backup independente e restauração em ambiente real. O reembolso no Postgres foi testado em instância isolada; carga concorrente em múltiplas conexões do ambiente de homologação ainda precisa ser verificada.

## Validação local

- `npm test`: suíte com adaptadores fictícios para Storage/S3 e Postgres isolado via PGlite. Nenhuma credencial real é usada pelos testes.
- `node tests/documentos-browser.cjs`: fluxo de navegador; requer Playwright instalado ou `KAHENNA_PLAYWRIGHT_MODULE` apontando para o módulo disponível no ambiente. Usa Edge headless, PDF fictício e adaptadores locais; não acessa AWS/Supabase reais.
- A validação local não comprova credenciais, políticas IAM ou configuração do projeto remoto.

Resultado da validação desta entrega: 30 testes automatizados passaram; o fluxo no Edge foi verificado em desktop e celular, incluindo PDF de duas páginas, bloqueio da confirmação antes de percorrê-las, ampliação, falha simulada e consulta após arquivar. O comando de instalação do Render foi validado com `npm ci --omit=dev --dry-run --ignore-scripts`. A instalação auditou as dependências sem vulnerabilidades reportadas naquele momento.
