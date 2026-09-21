# +2d6 • Nitro para Foundry VTT 14

Implementação das fichas e rolagens do +2d6, baseada no manual de Newton “Tio Nitro” Rocha em `docs/+2d6 tio nitro.pdf`. Os packs ainda não são instalados automaticamente, mas o catálogo-fonte para gerá-los está incluído.

## Começar

Reinicie o Foundry para atualizar o manifesto. Crie um mundo com o sistema **+2d6 • Nitro** e um Actor do tipo **Personagem** ou **NPC / Criatura**. A ficha salva os campos automaticamente.

- **Testes:** atributos no topo e perícias agrupadas em físicas, mentais, sociais e sobrenaturais.
- **Combate:** armas, dano de Força, iniciativa, proteção, morte e sanidade opcional.
- **Capacidades:** vantagens, desvantagens e poderes/magias.
- **Equipamento:** quantidades, peso e itens equipados.
- **História:** biografia, anotações, evolução e configuração dos recursos automáticos ou manuais.

Use os botões **+** nas seções para criar Items diretamente no Actor. Também é possível criar um Item no diretório e arrastá-lo para a ficha. A cópia na ficha é independente do original. O lápis edita, o dado prepara a rolagem e a lixeira pede confirmação. Items podem ser arrastados para a barra de macros.

## Organização dos documentos

| Documento | Tipo | Conteúdo |
| --- | --- | --- |
| Actor | `character` | Personagem de jogador; token vinculado por padrão |
| Actor | `npc` | NPC, criatura, aliado ou inimigo, com ND de 0 a 10 |
| Item | `skill` | Atributo, graduação, categoria e especialização |
| Item | `weapon` | Perícia por nome, atributo, precisão, dano, alcance e munição |
| Item | `armor` | RD, quantidade, peso e estado equipado |
| Item | `equipment` | Equipamento comum e bônus circunstancial |
| Item | `advantage` / `disadvantage` | Custo ou pontos concedidos e teste opcional |
| Item | `power` | Poder ou magia, graduação, atributo, custo em PE, dano e efeito |

Os schemas estão em `module/data.mjs`; os atributos e recursos pertencem ao Actor. As capacidades e os objetos pertencem a Items embutidos. Poderes usam a graduação como valor de perícia e não precisam de outra vantagem duplicada. A categoria Magia permite registrar feitiços; variantes de mana separada e criação automática de efeitos mágicos não são automatizadas.

Exemplo de Item embutido:

```js
await actor.createEmbeddedDocuments('Item', [{
  name: 'Investigação',
  type: 'skill',
  system: {attribute: 'int', rank: 3, category: 'mental'}
}]);
```

Atributos: `str`, `dex`, `con`, `int`, `wis`, `cha`, `pow`, cada um em `system.attributes.<chave>.value`. Recursos na raiz: `system.health`, `system.energy`, `system.sanity`, `system.narrative` e `system.action`. Não existe um nível intermediário `system.resources`.

## Catálogo-fonte de compêndios

[`nitro2d6-content.json`](nitro2d6-content.json) reúne o conteúdo extraído do livro para a futura integração. Cada entrada em `packs[].documents` já é uma fonte nativa do Foundry VTT 14: `Item`, `Actor` ou `JournalEntry`. O manifesto externo apenas separa os packs por categoria.

- Perícias, vantagens, desvantagens, armas, armaduras, equipamentos, poderes e magias são fontes de `Item` com os campos de `system` definidos em `module/data.mjs`.
- PdMs e criaturas possuem fontes de `Actor` tipo `npc`, com suas armas, armaduras, perícias e habilidades como Items incorporados.
- Regras e tabelas que não são entidades jogáveis são fontes de `JournalEntry`; o catálogo também inclui uma página que abre o PDF original.
- Informações impressas que não cabem no schema atual, como tipos específicos de dano, alternativas de atributo, custos por graduação e observações de OCR, permanecem em `flags.nitro2d6.content`.

O futuro importador deve percorrer cada pack e chamar a criação do `documentName` informado; não deve enviar o objeto do catálogo inteiro ao Foundry.

## Importar o catálogo no mundo

O arquivo [`macros/import-nitro2d6-content.js`](macros/import-nitro2d6-content.js) é uma Macro do tipo **Script** para Foundry VTT 14. No diretório de macros do Foundry, crie uma macro, cole o conteúdo desse arquivo e execute-a como Mestre. O diálogo solicita o JSON; cole nele o conteúdo completo de [`nitro2d6-content.json`](nitro2d6-content.json) e confirme.

A macro cria as pastas-raiz `+2d6 — Itens`, `+2d6 — Atores` e `+2d6 — Referências`, com uma subpasta para cada categoria do catálogo, e cria os documentos dentro delas. Cada documento recebe uma marca de importação em `flags.nitro2d6.import`; assim, executar a mesma importação novamente ignora os documentos já criados, sem duplicá-los.

## Rolagens e decisões das regras

- Teste normal: **2d6 + atributo + perícia + modificadores**, sucesso com total igual ou maior à CD. Referências: 8 fácil, 10 normal, 14 difícil (p.16 e 36).
- Teste oposto: vence o maior total; empate não declara vencedor. É possível deixar o resultado do oponente em branco para comparar depois.
- Ocasião: **±2, ±4 ou ±6**. Narrativa adiciona **1d6** e ação adiciona **2d6**, mantendo todos os dados. O desconto de recursos depende de seleção explícita; cancelar não gasta pontos. Os limites de um uso por cena/combate são lembrados no diálogo e controlados pela mesa (p.40).
- Críticos dependem apenas dos dois dados básicos: 6+6 e 1+1. Não há dano dobrado automático; o mestre escolhe as consequências (p.16).
- Iniciativa: **2d6 + DES + bônus da tabela + ajuste da ficha**. O botão na ficha permite atualizar um combatente já presente no combate. Empates significam ações simultâneas. O modificador anotado na arma é uma referência a aplicar no ajuste da ficha quando apropriado (p.19, 37 e 45).
- Dano tem diálogo separado, fórmula editável, RD aplicável e dobra opcional. `@strengthDamage + 1` usa a tabela de Força (p.18/42). A carta mostra o dano após RD; sua aplicação no alvo é manual. Munição e bônus de equipamento são controlados pela mesa.
- PV automático: **base + FOR + CON + bônus da tabela de CON + bônus manual**, acrescentando 10 em campanha heroica. PE automático: **10 + POD + bônus manual**. SAN: **10 + INT + SAB + maior perícia acadêmica + bônus manual**, acrescentando 10 em campanha heroica (p.20 e 39). Máximos manuais atendem outras variantes e NPCs. Alterar atributos não recupera pontos atuais.
- A RD exibida usa a maior armadura equipada, somada à RD natural/adicional. O mestre ajusta a RD no diálogo conforme tipo e local do golpe; todas as armaduras não são somadas indiscriminadamente (p.38).
- Morte: 2d6 contra 6, três fracassos causam morte e 12 estabiliza. O registro dos fracassos é selecionável. Sanidade usa inicialmente o maior atributo entre INT/SAB e permite descontar a perda escolhida em caso de falha (p.38–39).
- O livro diverge sobre escala: p.17 cita +6/+12 e p.36 cita +10. O diálogo apresenta essas alternativas explicitamente. Tabelas de bônus param em atributo 10; valores superiores usam o último bônus tabelado, com ajustes manuais. Dano de Força fora de 1–10 precisa de fórmula definida pelo mestre.

## Desenvolvimento e verificação

```sh
npm run build
npm test
```

O CSS é gerado a partir de `src/scss/nitro2d6.scss`. Testes de regras e diálogos rodam em Node. Os testes de schemas usam os modelos reais de uma instalação do Foundry; encontram a instalação adjacente ou aceitam `FOUNDRY_PATH` apontando para a pasta que contém `common/server.mjs` (ou a raiz do aplicativo). Sem essa instalação, esses testes específicos são marcados como ignorados.

A entrada ativa é `module/nitro2d6.mjs`. Arquivos antigos com `boilerplate` e o gerador em `src/` são a base histórica e não entram no runtime do sistema.

Base técnica: Boilerplate de Asacolips e Lee Talman, licença em `LICENSE.txt`. Regras: +2d6 de Newton Rocha; os créditos do boilerplate não representam autoria das regras.
