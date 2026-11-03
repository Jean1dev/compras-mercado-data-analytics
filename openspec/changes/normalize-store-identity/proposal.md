## Why

O ranking mensal agrupa pelo texto exato de `storeName`. A mesma loja já salva aparece em várias linhas porque o cupom vem com caixa, sufixo e leitura diferentes (`MONIARI`, `Moniari`, `LI` no lugar de `L1`, `Woniari`). O gasto, as visitas e o ticket médio dessa loja ficam partidos, e qualquer análise por estabelecimento herda o erro.

## What Changes

- Resolver cada compra para uma loja estável, preservando o `storeName` cru do cupom.
- Usar CNPJ somente quando os dígitos verificadores fecham; caso contrário, comparar o nome fantasia com Jaro-Winkler e a filial como token à parte (`LI` e `L1` são a mesma filial; `L2` e outra cidade continuam outras lojas).
- Gravar o id da loja na compra nova, no momento de salvar.
- Fazer o `GET /reports/:month` agrupar por essa loja e exibir o rótulo canônico (a grafia mais frequente). O formato do JSON permanece o mesmo; as linhas do ranking é que se juntam.
- Corrigir as compras já salvas com um script idempotente, reutilizando a mesma resolução. Sem endpoint HTTP para reescrever o histórico: o servidor não autentica a rota, e o relatório já é a superfície que mostra o resultado.
- Manter o webhook `storeName` com o nome cru extraído do cupom.

## Capabilities

### New Capabilities

- `store-identity`: Identidade estável de estabelecimento a partir do cupom, atribuição na compra nova, agrupamento do relatório mensal e correção das compras já persistidas.

### Modified Capabilities

_(nenhuma — `receipt-extraction` segue devolvendo o nome cru do cupom)_

## Impact

- **Código**: `src/models/Purchase.ts`, novo model de loja, módulo de resolução, `src/processAndSave.ts`, `src/monthlyReport.ts`, script de correção e atalho no `package.json`.
- **API**: `GET /reports/:month` passa a colapsar aliases no `storeRanking` e em `topStore`. `POST /receipts` e os webhooks não mudam de formato.
- **Dados**: compras existentes ganham referência à loja só depois de rodar o script. Até lá, o relatório resolve o histórico na leitura para o ranking não depender da ordem de execução.
- **Fora de escopo**: normalizar nome de produto, deduplicar cupom, reescrever `storeName` por cima do texto original.
