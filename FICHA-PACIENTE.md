# Ficha do paciente e busca geral

**Pacientes → Ver mais** abre a ficha com próximo horário, total recebido e quatro seções recolhidas. Abra uma seção por vez para consultar agenda, materiais usados, pagamentos ou PDFs. Na **Agenda**, clicar no nome abre a mesma ficha já em **Atendimentos e agenda**. O lápis abre somente a edição do horário. **Registrar materiais** abre a baixa com o paciente e sua lista padrão já selecionados.

**Busca geral** fica no menu lateral (também `Ctrl+K`). Os resultados são agrupados por pacientes, agenda, produtos, lotes e PDFs. A busca aceita termos sem acentos e partes do telefone. Um produto ou lote abre o estoque filtrado pelo produto. Um PDF abre o visualizador privado já existente, com conferência de integridade.

Se o nome ou telefone corresponder a um cadastro existente, o aviso aparece antes de gravar. O operador pode **Abrir cadastro**, ajustar os campos ou escolher **Cadastrar mesmo assim**. A confirmação é revalidada no servidor contra os resultados atuais; o sistema não une cadastros automaticamente. Na edição, o próprio registro não é considerado duplicado.

Materiais, estoque, lotes e PDFs respeitam o acesso administrativo já existente. A pesquisa de PDFs considera somente nomes de arquivos e do paciente e registra a consulta em auditoria; os bytes continuam nos endpoints protegidos de documentos. As seções carregam sob demanda e paginam o histórico.

As consultas usam as tabelas e permissões existentes, sem migração. Testes: `npm test`. Prévia fictícia: `node tests/paciente-unificado-preview.cjs` (porta 3103, PostgreSQL temporário, nenhum dado real).
