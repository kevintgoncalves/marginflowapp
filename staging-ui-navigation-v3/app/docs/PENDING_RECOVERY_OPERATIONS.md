# Recuperação de pendentes e custódia supervisionada

## Pertença verificável

Na versão desta etapa: Settings → Pending invoice recovery. A leitura cloud autenticada deve confirmar o ID da fatura na empresa **e localização** atuais. Um campo companyId no JSON não é prova suficiente. Só são mostradas versões com identidade confirmada e sem declaração de âmbito contraditória. O utilizador precisa de permissão de edição de faturas.

Exportar os originais verificados e comprovar que o ficheiro abre antes de confirmar recuperação. O botão não grava na cloud: adiciona trabalho pendente para revisão/retry explícito. Conserva IDs, versão e syncRetryContext; impede importação de revisões antigas, contexto incoerente, IDs repetidos e sobreposição de pendentes atuais. A pertença e revisão são lidas novamente no momento da recuperação, e o RPC mantém o controlo de revisão na gravação. As chaves antigas permanecem intactas.

## Dados ambíguos

IDs ausentes da cloud, registos de outra empresa, ausência de localização verificável ou identificação contraditória não são mostrados nem importados. A interface apresenta apenas uma contagem. Isso inclui novas faturas antigas que nunca chegaram à cloud; não inventar uma associação com base no login, nome de fornecedor ou número da fatura.

A via supervisionada requer um responsável com acesso legítimo ao dispositivo/arquivo de origem e prova externa de pertença (origem assinada/verificável, documentação de custódia e empresa/localização confirmadas). Falta definir esse responsável e mecanismo de atestação no serviço. Até lá, estes registos ficam **retidos**, não “recuperados”. A interface normal não permite exportar em claro dados ambíguos de outras contas.

Foi preparado `scripts/sealed-recovery.mjs` para custódia offline de um arquivo que o supervisor já possua legalmente. O utilitário não extrai dados do browser, não lê perfis de outras contas, não atribui empresa e não importa nada:

```sh
node scripts/sealed-recovery.mjs seal ORIGINAL.json SUPERVISOR_PUBLIC.pem NOVO_ARQUIVO_SEALED.json
node scripts/sealed-recovery.mjs unseal NOVO_ARQUIVO_SEALED.json SUPERVISOR_PRIVATE.pem ORIGINAL_RECUPERADO.json
```

A chave do supervisor deve ser previamente autenticada, e a privada mantida fora da aplicação e do Git. O formato usa AES-GCM e encapsula a chave com RSA-OAEP-SHA256; o ficheiro de saída é criado com permissões 0600 e recusa sobrescrever ficheiros existentes. Testado round-trip byte a byte, alteração do ciphertext e chave errada. Isto protege custódia; **não constitui prova de pertença**. Não inserir uma chave arbitrária escolhida por outra conta na interface para exportar dados ambíguos.

## Falha de quota

O aviso inclui o nome do erro. “Export work still in this page” exporta o snapshot atual e os writes rejeitados ainda em memória, com chaves lógicas, tamanho da tentativa e nome do erro. A exportação normal do armazenamento pode estar desatualizada, pelo que este botão não depende de conseguir voltar a escrever em localStorage.

Se fechar, recarregar, terminar sessão ou mudar de âmbito antes de confirmar cloud/exportação, as alterações presentes só em memória podem perder-se. O beforeunload tenta avisar, mas não protege contra crash, encerramento forçado ou perda de energia. Browser storage e downloads locais não são política de backup.

O arquivo `marginflow-live-work-v1` pode ser selecionado em Inspect pending archive na versão nova; as suas faturas passam pelos mesmos controlos de pertença e conflito. Os restantes módulos ficam preservados no arquivo, mas não têm importação automática neste fluxo.

## Reversão de código

Antes de reverter: exportar pendentes atuais e, se houver falha de armazenamento, o trabalho em memória; comprovar a legibilidade. Preservar ambas as gerações de chaves e os arquivos. `f2caa5e` já lê o namespace scoped, mas não contém o novo painel de recuperação. A compatibilidade de leitura/retry foi testada ao nível do repositório/API, preservando uma gravação posterior e recusando a versão antiga. **O ciclo completo no browser ficou bloqueado pela ferramenta.**

Manter a versão de recuperação acessível num ambiente autorizado separado se for preciso inspecionar os novos formatos após rollback. Nunca copiar todos os pendentes para chaves globais para satisfazer uma versão antiga. A versão `737f769` usa o modelo anterior de cache e não tem rollback de pendentes aprovado. Não restaurar uma base antiga como forma de desfazer um rollback de código.
