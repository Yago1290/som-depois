# Somspot

Jogo web em Next.js, React e TypeScript. Para rodar localmente:

```sh
pnpm install
pnpm dev
```

## Catálogo e previews

O jogo pesquisa músicas comerciais pela [iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/) da Apple, usando a loja do Brasil. A busca retorna metadados da faixa e, quando a Apple disponibiliza, um `previewUrl` de áudio que é reproduzido diretamente pelo elemento HTML Audio. Não há chave privada nem backend necessário para a busca.

A disponibilidade do preview varia por faixa e território. Resultados sem `previewUrl` são reconhecidos, não são escolhidos para rodadas e não são substituídos por áudio aleatório. O filtro de loja consulta o storefront Brasil ou Estados Unidos; isso altera o catálogo disponível, não identifica a nacionalidade do artista. Os gêneros são filtrados pelos rótulos de gênero fornecidos pela Apple; trap usa as categorias mais amplas Hip-Hop/Rap e Rap, pois a API não fornece uma classificação consistente de subgênero trap. O preview pode durar menos que 30 segundos; o player limita o trecho à duração real informada pelo navegador. A precisão dos trechos curtos depende do carregamento, do buffer e do escalonamento de áudio do navegador, então não há garantia de precisão acústica de 0,1 segundo em todos os dispositivos.

A API de busca e os previews não constituem, por si só, uma licença para qualquer uso comercial ou formato de jogo. Confira os termos aplicáveis da Apple e obtenha as permissões necessárias antes de publicar ou distribuir o jogo. A busca é feita para `country=BR`; catálogo e previews podem variar por região.
