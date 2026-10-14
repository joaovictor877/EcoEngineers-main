# App Android — EcoEngineers Gestor

Projeto Android Studio (Kotlin) do app do gestor, previsto no slide 7 da pré-banca.

- **Tela principal:** o painel do sistema (caixas validadas, retidas e histórico), carregado do servidor.
- **Alertas:** o `AlertService` assina `alertas/#` no broker MQTT do servidor (`wss://<servidor>/mqtt`)
  e mostra uma notificação a cada caixa reprovada, com linha, posto, caixa e motivo — mesmo com o app fechado.
- **Login:** o mesmo do site. Depois de entrar, o app usa o token do login como senha no broker
  (o broker só deixa o app **assinar**; quem publica são os postos e o servidor).

## Abrir e gerar o APK

1. Android Studio → **Open** → selecione a pasta `android/`.
2. Se o Android Studio pedir, aceite criar o Gradle Wrapper (a versão está em `gradle/wrapper/gradle-wrapper.properties`).
3. Ajuste `SERVER_URL` e `MQTT_URL` em `app/build.gradle.kts` para o endereço do deploy.
4. **Run** num celular com Android 8+ (ou **Build → Build APK(s)**).

No Azure, ative **WebSockets** no App Service (já necessário para o Socket.IO), pois o broker
é acessado em `wss://<servidor>/mqtt`.
