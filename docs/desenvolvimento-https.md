# Acessar o One Diário por HTTPS na rede local

O Safari só disponibiliza `crypto.subtle` quando a página está em um contexto seguro. Para acessar o servidor de desenvolvimento pelo iPhone usando o IP local, use um certificado confiável para esse IP.

## 1. Instalar mkcert no Windows

Em um terminal PowerShell, instale a ferramenta gratuita mkcert:

```powershell
winget install -e --id FiloSottile.mkcert
```

Feche e reabra o terminal para atualizar o `PATH`. Consulte o [repositório oficial do mkcert](https://github.com/FiloSottile/mkcert) para outros métodos de instalação.

## 2. Criar o certificado para o IP do computador

Execute a partir da pasta raiz do projeto. O IP atual deste computador é `192.168.18.102`; se ele mudar, substitua-o pelo IPv4 mostrado pelo comando `ipconfig`.

```powershell
New-Item -ItemType Directory -Force .local-dev-certs | Out-Null
mkcert -install
mkcert -cert-file .local-dev-certs/lan.pem -key-file .local-dev-certs/lan-key.pem 192.168.18.102 localhost 127.0.0.1 ::1
```

`mkcert -install` cria uma autoridade certificadora local e confia nela neste computador. O certificado gerado inclui o IP como SAN, além dos endereços locais usados no computador. Os arquivos ficam em `.local-dev-certs/`, que está ignorada pelo Git.

## 3. Confiar na autoridade certificadora no iPhone

1. Descubra a pasta da CA executando `mkcert -CAROOT` no computador.
2. Transfira **somente** o arquivo `rootCA.pem` dessa pasta para o iPhone, por AirDrop ou outro meio privado.
3. Nunca transfira `rootCA-key.pem`, `lan-key.pem` ou qualquer outra chave privada. A chave da CA permite emitir certificados confiáveis e deve permanecer apenas no computador.
4. No iPhone, abra o arquivo `rootCA.pem` e instale o perfil em **Ajustes > Geral > VPN e Gerenciamento de Dispositivo** (o nome da seção pode variar conforme a versão do iOS).
5. Em seguida, acesse **Ajustes > Geral > Sobre > Ajustes de Confiança de Certificados** e ative a confiança total para a CA local.
6. Confirme o aviso do iOS para concluir a instalação.

Sem instalar e confiar nessa CA no iPhone, o Safari não considerará confiável o certificado local. Não ignore avisos de certificado para usar o diário.

## 4. Iniciar e abrir o aplicativo

Na raiz do projeto, execute:

```powershell
npm run start:lan:https
```

Com o iPhone e o computador na mesma rede Wi-Fi, abra no Safari:

```text
https://192.168.18.102:4200
```

O servidor usa a configuração `lan-https` do Angular, escuta na rede local e carrega os arquivos de certificado ignorados pelo Git. Se o IP mudar, gere novamente o certificado para o novo IP antes de iniciar o servidor.

## 5. Verificar Web Crypto e cadastrar o PIN

No Safari, confirme que a página abre sem aviso de certificado. No Web Inspector remoto, verifique:

```javascript
window.isSecureContext === true
window.crypto.subtle !== undefined
```

Então conclua o fluxo normal de primeiro acesso: escolha o PIN, confirme-o e aguarde a abertura do diário. Feche a aba ou o Safari, abra novamente o mesmo endereço HTTPS, informe o PIN e confirme que o desbloqueio funciona.

O teste E2E existente também verifica a disponibilidade de `crypto.subtle` em `localhost` e percorre criação, confirmação, recarga e desbloqueio. O `localhost` é usado pelo teste automatizado; o teste no iPhone continua necessário para validar a CA instalada e o certificado correspondente ao IP.

## Dados existentes no endereço HTTP

O endereço HTTPS tem uma origem diferente de `http://192.168.18.102:4200`. O armazenamento web vinculado ao endereço HTTP não será apagado, mas também não aparecerá automaticamente na origem HTTPS. Este procedimento não exporta, migra nem reinicializa o banco HTTP.

## APK Android

Este modo altera apenas o servidor de desenvolvimento acessado pelo Safari. Ele não altera o `capacitor.config.ts`, o APK instalado, o SQLite nativo nem as configurações Android.
