# AI Switch CLI (Multi-Tool & Multi-Provider)

## 1. Visão Geral do Produto

O **AI Switch CLI** é uma ferramenta de linha de comando universal projetada para centralizar, gerenciar e alternar dinamicamente entre diferentes provedores de inteligência artificial alternativos e variadas ferramentas de desenvolvimento baseadas em IA do mercado (como Claude Code, Aider, Open Interpreter, entre outras).

O principal objetivo da aplicação é eliminar a complexidade e os altos custos associados ao uso exclusivo de planos oficiais, permitindo que o desenvolvedor conecte endpoints customizados, descubra modelos em tempo real e alterne de forma fluida entre diferentes ambientes de trabalho através de uma interface de terminal interativa.

---

## 2. Objetivos e Benefícios

- **Otimização de Custos:** Viabilizar o uso contínuo de assistentes de desenvolvimento baseados em IA por meio do direcionamento de requisições para APIs econômicas ou provedores alternativos.
- **Agilidade e Versatilidade:** Permitir que o usuário troque de ferramenta de desenvolvimento e de provedor de IA com poucos cliques no terminal.
- **Padronização de Credenciais:** Centralizar o armazenamento e a gestão de chaves de API e URLs base em um único local seguro.
- **Descoberta Dinâmica:** Facilitar a visualização dos modelos de inteligência artificial disponíveis diretamente em cada provedor cadastrado.

---

## 3. Requisitos Funcionais

### 3.1. Menu Interativo Principal

- O sistema deve apresentar uma interface de menu baseada em texto ao ser executado, permitindo navegação intuitiva por meio de opções numéricas.
- As funcionalidades principais acessíveis pelo menu incluem:
  1. **Iniciar Ferramenta:** Seleção integrada da ferramenta de desenvolvimento desejada, do provedor de IA, do modelo e do agente de atuação.
  2. **Cadastrar Novo Provedor:** Inclusão de novos serviços de IA.
  3. **Ver Modelos:** Consulta aos modelos suportados pelo provedor selecionado.
  4. **Ver Agents:** Listagem dos perfis ou modos de operação configurados.
  5. **Diagnóstico:** Verificação de integridade do ambiente e status de conexão com os provedores.
  6. **Sair:** Encerramento da aplicação.

### 3.2. Gerenciamento de Provedores

- O processo de cadastro de novos provedores deve ser guiado em etapas separadas e isoladas para evitar erros de digitação:
  1. Definição de um nome identificador único.
  2. Inserção da URL base do serviço.
  3. Informação da chave de autenticação (API Key).
- As informações configuradas devem ser persistidas localmente para uso em sessões futuras.

### 3.3. Descoberta e Consulta de Modelos

- A aplicação deve ser capaz de consultar os modelos ofertados diretamente no endpoint de catálogo do provedor configurado.
- O resultado da consulta deve ser processado e exibido ao usuário de maneira limpa, organizada e legível.

### 3.4. Diagnóstico de Ambiente (Doctor)

- O sistema deve realizar checagens automáticas para assegurar que as ferramentas de desenvolvimento escolhidas estão devidamente instaladas e acessíveis no ambiente do usuário.
- Deve executar testes de conectividade e autenticação com os provedores cadastrados para confirmar se as credenciais estão ativas e funcionais.

### 3.5. Inicialização Unificada (Start)

- Ao iniciar uma ferramenta de desenvolvimento, o sistema deve aplicar automaticamente as credenciais, rotas e parâmetros correspondentes ao provedor e modelo selecionados, garantindo a compatibilidade esperada pela ferramenta de destino.

---

## 4. Requisitos Não Funcionais

- **Portabilidade e Leveza:** A ferramenta deve operar de maneira ágil, com respostas imediatas a comandos de navegação e consumo mínimo de recursos do sistema operacional.
- **Segurança e Privacidade:** O armazenamento local de credenciais deve ser restrito ao escopo do perfil do usuário, preservando a confidencialidade das chaves de acesso.
- **Experiência do Usuário (UX):** A interface deve seguir um padrão conversacional e estruturado de terminal, garantindo clareza e previsibilidade em cada etapa de interação.
