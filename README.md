# Entre Nós

Reconstrução profissional do projeto de finanças para casais com:

- autenticação via Supabase
- vínculo de casal por convite ou código
- `RLS` por `couple_id`
- dashboard com gráficos
- metas com aporte automático
- categorias personalizadas
- notificações internas

## Estrutura

- `index.html`: interface principal
- `styles.css`: tema dark modern e feedback visual
- `js/config.js`: URL e chave pública do Supabase
- `js/supabase.js`: cliente e autenticação
- `js/api.js`: camada de acesso aos dados
- `js/ui.js`: renderização, gráficos e feedback visual
- `js/main.js`: orquestração e eventos
- `supabase/schema.sql`: banco, funções, triggers e políticas RLS

## Como ligar no Supabase

1. Crie um projeto no Supabase.
2. Rode o SQL de `supabase/schema.sql` no SQL Editor.
3. Edite `js/config.js` com:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
4. Sirva os arquivos com um servidor estático.

## Observações

- As categorias padrão são criadas quando o primeiro convite do casal é gerado.
- Despesas com categoria do tipo `reserve` e `goal_id` preenchido atualizam automaticamente o progresso da meta.
- Gastos altos criam notificações para o parceiro.
- Contas próximas do vencimento geram notificações internas via RPC `sync_due_bill_notifications`.
