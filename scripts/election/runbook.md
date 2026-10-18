# Runbook Operacional: Noite de Apuracao (25/10/2026)

**Data da operacao:** Domingo, 25 de outubro de 2026  
**Horario critico:** 16h30 ate a totalizacao final (100% das secoes)  
**Operador:** Manoel Osmide de Sousa Junior  
**Objetivo:** Garantir a gravacao integra da apuracao do 2o turno presidencial em Sao Paulo (GRV-01, GRV-02, GRV-03), a execucao da sonda externa de monitoramento e o cumprimento estrito das regras de contingencia (E24, E38, FLG-04).

---

## 1. Preparacao da Maquina Host Principal (16h00 as 16h30)

Executar antes do inicio da transmissao do TSE:

1. **Alimentacao eletrica:** Conectar o notebook ou computador a tomada com fonte original. Nunca operar na bateria durante a apuracao.
2. **Suspensao e tela:** Desativar suspensao automatica, hibernacao e desligamento de disco:
   - No Windows: `Configuracoes > Sistema > Energia e suspensao` -> alterar "Ao estar conectado, suspender depois de" para **Nunca**.
   - Plano de energia configurado para "Alto Desempenho".
3. **Windows Update:** Pausar atualizacoes obrigatoriamente por 7 dias em `Configuracoes > Windows Update > Pausar atualizacoes por 1 semana`.
4. **Rede:** Conectar preferencialmente via cabo Ethernet. Manter o Wi-Fi ou roteador 4G pessoal previamente pareado e testado para contingencia caso o link fixo oscile.
5. **Espaco em disco:** Confirmar pelo menos 5 GB livres para gravacao continuada do log NDJSON.

---

## 2. Gravador Principal (16h30)

O gravador principal roda na estacao de trabalho do operador e utiliza taxa autoimposta <= 10 req/s com log NDJSON de acrescentamento exclusivo (GRV-01, GRV-02):

```powershell
# Executar no terminal PowerShell a partir da raiz do repositorio
node scripts/election/record.mjs --out data/election/records.ndjson --interval 60000 --server https://resultados.tse.jus.br
```

### Procedimento com supervisor de reinicio automatico:
Caso o processo seja interrompido por oscilacao momentanea, usar o laco supervisor que reinicia o processo imediatamente (o gravador descarta automaticamente qualquer linha final truncada sem perder dados e sem duplicar leituras):

```powershell
while ($true) {
  Write-Host "[SUPERVISOR] Iniciando gravador principal..." -ForegroundColor Cyan
  node scripts/election/record.mjs --out data/election/records.ndjson --interval 60000 --server https://resultados.tse.jus.br
  Write-Warning "[SUPERVISOR] Processo encerrou. Reiniciando em 5 segundos..."
  Start-Sleep -Seconds 5
}
```

### Checagens a cada ciclo:
- **Terminal:** O gravador exibe pulso periodico com o total de municipios lidos, secoes apuradas e contagem de erros 404.
- **Arquivo de log:** Conferir que `data/election/records.ndjson` cresce continuamente a cada minuto.
- **Alerta de 3 minutos:** Se nenhuma leitura com sucesso ocorrer em mais de 180 segundos, o gravador emite aviso visual no terminal `[ALERT] No successful reading for >3 minutes`. Nesse caso, checar conectividade de rede imediatamente.

---

## 3. Gravador Reserva (GRV-03, 16h35)

Para mitigar o risco de perda da noite unica (E17, GRV-03), manter uma segunda maquina ativa:

1. **Isolamento de infraestrutura:** Segunda maquina ligada a tomada, operando em rede distinta (exemplo: roteada via 4G do smartphone reserva com outro IP externo).
2. **Comando de execucao:**
   ```powershell
   node scripts/election/record.mjs --out data/election/records-reserva.ndjson --interval 60000 --server https://resultados.tse.jus.br
   ```
3. A gravacao reserva roda em paralelo durante toda a apuracao, garantindo tolerancia total a falha de hardware ou corte de banda fixa.

---

## 4. Roteiro da Sonda Externa em Smartphone 4G

Afericao independente no celular conectado a rede movil 4G (sem usar o Wi-Fi do gravador), conferindo a versao publicada no GitHub Pages:

- **Endereco:** `https://junirojr.github.io/sp-em-relevo/?aba=2turno`
- **Tabela de horarios e conferencias:**

| Horario | Verificacao na pagina | Criterio de conformidade |
| :--- | :--- | :--- |
| **16h55** | Faixa de status | Exibe "Aguardando inicio da totalizacao" |
| **17h05** | Primeiros dados | Faixa transita para "Em apuracao" com horario "(Brasilia)" |
| **18h00** | Comparacao oficial | Comparar horario do TSE e % de secoes contra `resultados.tse.jus.br` |
| **19h30** | Autochecagem | Total estadual de SP no placar bate com a soma municipal |
| **21h00** | Encerramento | Confirmar proclamacao oficial ou totalizacao concluida |

Se o TSE pausar transmissao de atualizacoes, verificar que a faixa exibe textualmente: `"O TSE nao publicou dados novos desde HH:MM"`.

---

## 5. Regras de Conduta e Acoes no Domingo (E24, E38, FLG-04)

### Acoes terminantemente PROIBIDAS no domingo (25/10/2026):
- **PROIBIDO alterar qualquer linha de codigo do aplicativo (E24).**
- **PROIBIDO executar `git commit` ou `git push` no repositorio de codigo.**
- **PROIBIDO ligar qualquer funcionalidade ou chave em `data/status.json` (E38).** Nenhuma chave pode ser ativada durante o domingo de votacao.

### Acoes estritamente PERMITIDAS no domingo:
- Executar e monitorar o gravador principal e o gravador reserva.
- **Recuo de contingencia (FLG-04, E38):** Em caso de falha grave de integridade ou orientacao juridica, o operador pode exclusivamente **DESLIGAR** chaves no arquivo `data/status.json` (por exemplo, passar `secondRoundLive: false`), commitando e publicando apenas a desativacao da chave.
- O desligamento de chave e a unica acao de modificacao autorizada no domingo.

---

## 6. Procedimento Pos-Apuracao (Segunda-feira, 26/10/2026)

1. Apos a totalizacao final (`tf === "s"` em 100% das secoes), encerrar os gravadores com `Ctrl+C`.
2. Executar o compactador de replay localmente (GRV-04, RPL-06):
   ```bash
   node scripts/election/compact-replay.mjs --input data/election/records.ndjson --output data/election/replay-presidente-2t.json
   ```
3. Conferir que o arquivo gerado possui peso <= 300 KB (PUB-09).
4. O operador confere a reproducao do replay contra as leituras gravadas antes de autorizar a publicacao do dado (E35, RPL-06).
