# Relatório de Análise do Sistema - Projeto Entre Nós

## ✅ Problemas Corrigidos

### 1. Violação de Foreign Key ao Excluir (CORRIGIDO)
**Arquivo:** `supabase/fix-notification-fk.sql`
**Problema:** Ao excluir transações ou contas, o trigger tentava inserir notificação referenciando ID já excluído.
**Solução:** Não passar `transaction_id`/`bill_id` nas notificações de exclusão.

---

## ⚠️ Problemas e Brechas Encontrados

### 1. Políticas de RLS Faltantes para DELETE

**Tabelas afetadas:**
- `categories` - Não tem política de DELETE específica (usa "all")
- `goals` - Não tem política de DELETE específica (usa "all")
- `transactions` - Não tem política de DELETE específica (usa "all")
- `bills` - Não tem política de DELETE específica (usa "all")
- `events` - Não tem política de DELETE específica (usa "all")
- `plans` - Não tem política de DELETE específica (usa "all")

**Risco:** Qualquer membro do workspace pode excluir qualquer registro, mesmo sem permissão de edição.

**Recomendação:** Criar políticas separadas para DELETE que restrinjam apenas ao criador ou ao owner/admin.

---

### 2. Falta de Validação de Permissões em Updates

**Problema:** As políticas de UPDATE atuais apenas verificam se o usuário pertence ao workspace, mas não verificam se ele é o criador do registro.

**Exemplo:** Qualquer membro pode editar transações, contas, metas e eventos criados por outros membros.

**Recomendação:** Adicionar validação de `created_by` ou `user_id` nas políticas de UPDATE, ou criar roles (admin/member) com permissões diferentes.

---

### 3. Notificações sem Política de INSERT

**Tabela:** `notifications`
**Problema:** Não existe política de INSERT para a tabela `notifications`. O sistema depende de functions `security definer` para inserir notificações.

**Risco:** Se uma function tiver falha de segurança, notificações podem ser inseridas indevidamente.

**Recomendação:** Criar política de INSERT restrita a operations via trigger/function.

---

### 4. Convites sem Política de UPDATE/DELETE

**Tabela:** `couple_invites`
**Problema:** Não há políticas explícitas de UPDATE ou DELETE para convites.

**Risco:** Convites não podem ser cancelados ou reenviados adequadamente.

**Recomendação:** Adicionar políticas para permitir que o criador do convite possa cancelá-lo.

---

### 5. Perfis sem Política de DELETE

**Tabela:** `profiles`
**Problema:** Não há política de DELETE para perfis.

**Risco:** Usuários não podem excluir suas próprias contas completamente.

**Recomendação:** Criar política de DELETE ou function para exclusão completa de conta.

---

### 6. Workspace Members - Controle de Saída

**Problema:** A política `workspace_members_delete_self` permite que qualquer usuário saia de qualquer workspace, mas não há validação para evitar que o último owner saia.

**Risco:** Workspace pode ficar sem owner, tornando-se órfão.

**Recomendação:** Adicionar validação na function `leave_workspace` para impedir que o último owner saia, ou transferir automaticamente a propriedade.

---

### 7. Categorias Padrão Podem Ser Excluídas

**Tabela:** `categories`
**Problema:** Não há proteção para categorias padrão (`is_default = true`).

**Risco:** Usuários podem excluir categorias padrão do sistema.

**Recomendação:** Adicionar validação para impedir exclusão de categorias padrão ou adicionar política de soft delete.

---

### 8. Metas com Auto-Allocate sem Validação

**Coluna:** `goals.auto_allocate`
**Problema:** O campo existe mas não há lógica visível de auto-allocation no backend.

**Risco:** Funcionalidade pode estar incompleta ou inconsistente.

**Recomendação:** Implementar ou documentar a lógica de auto_allocate.

---

### 9. Contas Recorrentes - Instâncias Virtuais sem Persistência

**Arquivo:** `js/api.js` - função `expandRecurringBills`
**Problema:** Instâncias de contas recorrentes são geradas virtualmente no frontend, mas não são persistidas no banco.

**Risco:** 
- Instâncias não podem ser marcadas como pagas individualmente
- Histórico de pagamentos não é mantido
- Se a conta pai for excluída, todas as instâncias desaparecem

**Recomendação:** Considerar persistir instâncias mensais no banco ou criar tabela separada para instâncias recorrentes.

---

### 10. Falta de Auditoria/Log de Alterações

**Problema:** Não há tabela de auditoria para registrar alterações importantes.

**Risco:** Não é possível rastrear quem alterou o quê e quando.

**Recomendação:** Criar tabela `audit_log` e triggers para registrar alterações em tabelas críticas.

---

### 11. Validação de Valores Negativos/Zerados

**Tabelas:** `transactions`, `bills`, `goals`
**Problema:** Algumas tabelas têm `check (amount > 0)`, mas outras não têm validação adequada.

**Exemplo:** `goals.target_amount` tem validação, mas `goals.current_amount` não tem.

**Recomendação:** Padronizar validações de valores em todas as tabelas.

---

### 12. Timezone Inconsistente

**Problema:** Algumas datas usam `current_date`, outras usam `timezone('utc', now())`.

**Risco:** Inconsistências em cálculos de vencimento e relatórios.

**Recomendação:** Padronizar uso de UTC em todo o sistema.

---

## 🔒 Melhorias de Segurança

### 1. Rate Limiting para Convites
**Problema:** Não há limite para geração de convites.
**Recomendação:** Implementar rate limiting para evitar abuso.

### 2. Expiração de Sessão
**Problema:** Não há configuração explícita de expiração de sessão.
**Recomendação:** Configurar tempo de sessão adequado no Supabase.

### 3. Validação de Input no Frontend
**Problema:** Validações básicas, mas poderiam ser mais robustas.
**Recomendação:** Adicionar validação de tamanho máximo, caracteres especiais, etc.

### 4. Proteção Contra XSS
**Problema:** Uso de `innerHTML` em várias partes do código.
**Recomendação:** Sanitizar inputs ou usar `textContent` quando possível.

---

## 🚀 Melhorias de Performance

### 1. Indexes Faltantes
**Tabelas sem índices compostos:**
- `transactions(couple_id, occurred_on)` - para filtros por período
- `bills(couple_id, due_date)` - para contas a vencer
- `notifications(user_id, created_at)` - para notificações recentes

**Recomendação:** Criar índices compostos para queries frequentes.

### 2. Cache de Dados
**Problema:** Bootstrap carrega todos os dados a cada login.
**Recomendação:** Implementar cache local com validação de timestamp.

### 3. Paginação
**Problema:** Listas não têm paginação.
**Recomendação:** Implementar paginação para transações, notificações, etc.

---

## 📱 Melhorias de UX/Funcionalidade

### 1. Confirmação de Exclusão
**Problema:** Exclusões podem ocorrer sem confirmação adequada.
**Recomendação:** Adicionar modal de confirmação para todas as exclusões.

### 2. Desfazer Ações
**Problema:** Não há mecanismo de "undo" para exclusões.
**Recomendação:** Implementar soft delete ou lixeira com recuperação.

### 3. Notificações em Tempo Real
**Problema:** Notificações só são carregadas no bootstrap.
**Recomendação:** Implementar Realtime do Supabase para notificações push.

### 4. Exportação de Dados
**Problema:** Não há forma de exportar dados.
**Recomendação:** Adicionar exportação para CSV/PDF.

### 5. Filtros Avançados
**Problema:** Filtros são básicos.
**Recomendação:** Adicionar filtros por intervalo de datas, valores, etc.

---

## 🧹 Código e Manutenção

### 1. Console Errors/Warns
**Arquivos:** `js/main.js`, `js/api.js`
**Problema:** Alguns `console.error` e `console.warn` restantes.
**Recomendação:** Implementar sistema de logging adequado.

### 2. Funções Legadas
**Arquivo:** `js/ui.js`
**Problema:** Funções marcadas como "Legacy" mas mantidas.
**Recomendação:** Remover ou documentar adequadamente.

### 3. Testes Automatizados
**Problema:** Existem arquivos de teste mas não são abrangentes.
**Recomendação:** Expandir cobertura de testes.

### 4. Documentação
**Problema:** Falta documentação de API e arquitetura.
**Recomendação:** Criar documentação técnica completa.

---

## 📋 Prioridades Recomendadas

### Alta Prioridade (Crítico)
1. ✅ Corrigir foreign key violation (JÁ FEITO)
2. Adicionar políticas de DELETE restritivas
3. Validar permissões em UPDATE
4. Proteger categorias padrão

### Média Prioridade (Importante)
5. Criar índices para performance
6. Implementar paginação
7. Adicionar confirmação de exclusão
8. Implementar notificações em tempo real

### Baixa Prioridade (Melhorias)
9. Exportação de dados
10. Sistema de auditoria
11. Cache de dados
12. Documentação técnica

---

## 📝 Conclusão

O sistema está funcional e com boa arquitetura geral, mas possui algumas brechas de segurança nas políticas de RLS e oportunidades de melhoria em performance e UX. A correção do problema de foreign key foi o primeiro passo importante. Recomendo abordar as melhorias de alta prioridade antes de colocar o sistema em produção com múltiplos usuários.
