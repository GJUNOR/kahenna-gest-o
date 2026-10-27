# Kahenna Gestão

Plataforma independente da Dra. Kahenna Vieira: pacientes, agenda, confirmações manuais, financeiro e equipe. Tema claro e bordô, com layout para computador e celular.

## Configurado no Supabase
Projeto exclusivo `uabagdsrvgkhqxduztyk`, organização Kahenna-gestão. As tabelas `visitantes`, `agendamentos`, `conversoes`, `lancamentos_financeiros` e `acessos` foram criadas e verificadas. Os dados de validação foram revertidos. RLS habilitado, acesso direto negado para anon/authenticated; o banco é consultado somente pelo servidor autorizado. O aviso informativo de RLS sem políticas é intencional nesse modelo.

Cadastro público e login anônimo desativados. URL de autenticação: https://app.kahenna.com.br. As duas contas criadas pelo proprietário têm perfil administrador e acesso ativo, com usuários `kahenna` e `gustavo`. As senhas não estão no código nem neste pacote.

## Publicação pendente
O formulário do Render foi preparado com Node, build `npm ci --omit=dev`, start `npm start` e plano Free. O deploy ainda não foi iniciado. O código precisa ser enviado ao repositório `GJUNOR/kahenna-gest-o`, as variáveis privadas precisam ser preenchidas no Render e o subdomínio precisa ser validado. A integração do GitHub recusou a gravação nesta sessão.

Ver PUBLICAR-RENDER.md. Nunca copiar credenciais do Atlas/da clínica Espaço da Coluna. A landing page permanece na Netlify.

## Executar
Node 24, `npm ci` e `npm start`. Preencher as variáveis de `.env.example` em ambiente privado. A chave de servidor nunca deve aparecer no navegador, GitHub, landing page ou arquivos públicos.

## Validação
Sintaxe de JavaScript, proteção das páginas/APIs sem autenticação, login por usuário com dependências simuladas, criação/leitura/atualização do esquema em transação revertida e permissões das tabelas verificadas. Dependências instaladas e auditadas sem vulnerabilidades após atualização do lockfile. O fluxo completo com login real e persistência via Render ainda precisa ser testado depois da publicação.

Os arquivos database/*.sql documentam a configuração já aplicada. Não executar schema.sql novamente no projeto existente. Não há integração com Meta, campanhas ou envio automático de WhatsApp.


## Conferência de PDFs e correções locais

O fluxo manual de conferência e arquivamento S3 está implementado no código local. A configuração remota ainda precisa ser aplicada. Consulte CONFERENCIA-PDFS.md para a migração, permissões IAM, variáveis, testes e limitações. O estado relatado nas seções anteriores descreve a preparação original e não comprova uma implantação atual.
