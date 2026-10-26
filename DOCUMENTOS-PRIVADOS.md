# Documentos privados da Kahenna

## Operação
Em Pacientes, usar o botão PDFs. Administradores ativos podem enviar e baixar PDFs de até 15 MB. Secretarias não têm acesso aos documentos clínicos nesta versão. Cada upload gera um documento independente: nada é sobrescrito ou apagado pela interface.

O bucket `kahenna-prontuarios` é privado. Não criar políticas de acesso direto para anon/authenticated. Tabelas e RPC são acessíveis apenas pelo servidor autorizado, seguindo o modelo existente da aplicação. O servidor valida a sessão e o papel antes de cada operação e confere paciente e documento juntos no download. A chave privada permanece nas variáveis do Render.

Metadados e auditoria do upload são registrados em uma transação. Downloads e consultas exigem auditoria. PDFs têm hash SHA-256; downloads conferem conteúdo e tamanho, são anexos e não permitem cache. Nomes do paciente não são usados como caminhos no Storage. A aplicação não oferece exclusão de prontuários.

## Configuração
Aplicar `database/documentos-privados.sql` uma vez, exclusivamente no projeto Kahenna, antes da publicação do código. Não reaplicar schema.sql nem executar em Atlas. O limite de 15 MB também é aplicado no bucket. Não requer nova variável de ambiente nem plano pago.

## Limites e recuperação
A checagem de assinatura e final do PDF não equivale a antivírus nem valida assinatura digital do documento. Enviar somente PDFs de origem confiável. O histórico conserva cada envio, mas não substitui backup. Ainda é necessário configurar backup independente dos arquivos e do banco, testar restauração e definir retenção conforme as obrigações da clínica. Backups do banco Supabase não incluem PDFs do Storage.

Não descartar documentos originais em papel apenas por escaneá-los. Não há validação legal ou certificação de prontuário eletrônico implícita nesta implementação.

## Testes
`npm test`: testes de autorização real do middleware, rotas HTTP, PDF/tamanho/nome, paciente inexistente, troca de paciente, bucket público, falha de registro, auditoria e integridade. Os testes usam Supabase simulado. Testes de produção devem usar exclusivamente paciente e PDF fictícios e conferir os metadados, objeto privado e auditoria no projeto real.

`node tests/preview.cjs`: prévia local exclusivamente com dados fictícios. Esse arquivo não é importado pelo servidor de produção.
