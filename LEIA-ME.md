# Ex Libris

Biblioteca particular: estante, resumos, calendário de leitura e recomendações que aprendem com você.

- **Estante**: capas automáticas (Open Library + Google Books), prateleiras de Lendo, Falta o resumo, Lidos e Quero ler, modo capas ou lombadas.
- **Resumo obrigatório**: o livro só conta como lido depois da nota e do resumo.
- **Com base nessa leitura**: cada livro lido gera sugestões do próximo, pela IA gratuita (Gemini) ou pelo motor próprio da estante.
- **Calendário**: registre as páginas do dia; o progresso do livro se atualiza sozinho. Sequência de dias, meta diária e o ano em páginas.
- **Leitor**: seu ex-libris com perfil de leitura escrito pela IA, estatísticas e ajustes.

Tudo gratuito: site no GitHub Pages, dados no Firebase (plano gratuito), IA pelo plano gratuito do Google AI Studio.

## Ativar a IA (2 minutos)

1. Abra https://aistudio.google.com/apikey e entre com sua conta Google.
2. Toque em **Create API key**.
3. No site, vá em **Leitor → IA gratuita**, cole a chave e toque em **Salvar e testar**.

A chave fica no seu espaço privado. Ela não vai para o código do site.

## Ligar a sincronização entre celular e computador (Firebase, uns 10 minutos)

Sem isso, o site funciona, mas os dados ficam só no navegador onde você cadastrou.

1. Entre em https://console.firebase.google.com e clique em **Criar projeto**. Dê um nome (ex.: `ex-libris`). Pode desativar o Google Analytics.
2. Na página do projeto, clique no ícone **`</>`** (adicionar app da Web), dê um apelido e registre. Não precisa marcar o Hosting.
3. Copie o bloco `firebaseConfig = { ... }` que aparece e **mande para o Claude**, que cola em `js/firebase-config.js` e publica. Essa configuração é pública por natureza, pode mandar sem medo.
4. No menu lateral: **Criação → Authentication → Vamos começar → Google → Ativar → Salvar**.
5. Ainda em Authentication: **Configurações → Domínios autorizados → Adicionar domínio** e coloque o endereço do site sem o caminho, por exemplo `seuusuario.github.io`.
6. No menu lateral: **Criação → Firestore Database → Criar banco de dados**, escolha a região `southamerica-east1 (São Paulo)` e o **modo de produção**.
7. No Firestore, abra a aba **Regras**, apague o que estiver lá, cole o conteúdo do arquivo `firestore.rules` deste projeto e clique em **Publicar**.

Pronto: no site, toque em **Entrar com Google**. O que já estava cadastrado no aparelho vai junto para a nuvem.

## Instalar no celular

Abra o site no navegador do celular e use **Adicionar à tela inicial**. Ele abre como um app, em tela cheia.

## Estrutura

```
index.html            página única
css/style.css         visual (sebo antigo, tema claro e escuro)
js/app.js             telas e interações
js/store.js           dados: navegador ou Firebase
js/books-api.js       busca de livros, capas e motor de recomendação
js/ai.js              IA (Gemini) e perfil de leitor
js/firebase-config.js configuração do Firebase
firestore.rules       regras de segurança do banco
```
