# Publicar a Kahenna Gestão no Render

Endereço planejado: https://app.kahenna.com.br

## Configuração do serviço
- Tipo: Web Service
- Repositório exclusivo: GJUNOR/kahenna-gest-o
- Linguagem: Node
- Branch: main
- Build Command: npm ci --omit=dev
- Start Command: npm start
- Health Check Path: /health
- Plano inicial: Free. Não selecionar plano pago sem revisar o custo.

O arquivo render.yaml já contém essas configurações.

## Variáveis no Render
NODE_ENV=production
SITE_URL=https://app.kahenna.com.br
ALLOWED_ORIGINS=https://app.kahenna.com.br
KAHENNA_SUPABASE_URL=(URL do projeto exclusivo da Kahenna)
KAHENNA_SUPABASE_KEY=(chave privada de servidor desse projeto)

Não colocar chaves no GitHub nem no navegador. Nunca usar o banco da clínica Espaço da Coluna.
Para testar pelo endereço temporário do Render, acrescentar a origem exata dele em ALLOWED_ORIGINS e ajustar SITE_URL durante o teste.

## Antes de usar com pacientes reais
O banco exclusivo da Kahenna já foi criado e verificado. As contas administrativas também foram criadas pelo proprietário; os usuários de login são kahenna e gustavo. Não executar schema.sql novamente.

Depois do deploy, testar login com as senhas criadas no painel, logout, permissões, pacientes, agendamento, confirmação, pagamentos e equipe. A prévia local usa dados fictícios e não comprova persistência no Supabase.

## Domínio
Após o serviço funcionar, adicionar app.kahenna.com.br em Custom Domains no Render. No provedor DNS ativo do domínio, criar CNAME app apontando para o endereço onrender.com exato mostrado pelo Render. Manter os registros da landing page intactos. Aguardar validação DNS e HTTPS.
