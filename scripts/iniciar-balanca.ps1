# Liga a balanca no sistema: acha o Arduino sozinho e fica enviando o peso
# estavel para o site. Se o cabo USB soltar ou a internet cair, reconecta.
#
# Uso: clique duas vezes em scripts\iniciar-balanca.bat
#   ou: powershell -ExecutionPolicy Bypass -File scripts\iniciar-balanca.ps1
#
# Opcoes:
#   -Reconfigurar             pergunta de novo endereco, chave e posto
#   -PortName COM5            usa uma porta especifica em vez de detectar
#   -InstalarInicializacao    abre sozinho quando o Windows ligar
#   -RemoverInicializacao     desfaz a opcao acima

param(
  [string]$PortName,
  [switch]$Reconfigurar,
  [switch]$InstalarInicializacao,
  [switch]$RemoverInicializacao
)

. "$PSScriptRoot\balanca-comum.ps1"

$atalho = Join-Path ([Environment]::GetFolderPath("Startup")) "EcoEngineers Balanca.lnk"
if ($RemoverInicializacao) {
  if (Test-Path $atalho) { Remove-Item $atalho -Confirm:$false }
  Write-Host "Removido da inicializacao do Windows." -ForegroundColor Green
  return
}
if ($InstalarInicializacao) {
  $shell = New-Object -ComObject WScript.Shell
  $lnk = $shell.CreateShortcut($atalho)
  $lnk.TargetPath = Join-Path $PSScriptRoot "iniciar-balanca.bat"
  $lnk.WorkingDirectory = $PSScriptRoot
  $lnk.WindowStyle = 7   # minimizado
  $lnk.Save()
  Write-Host "Pronto: a balanca vai iniciar sozinha quando o Windows ligar." -ForegroundColor Green
}

$config = Get-BalancaConfig -Reconfigurar:$Reconfigurar
$ponte = Join-Path $PSScriptRoot "bridge-hx711-online.ps1"
$apiUrl = "$($config.ApiBase)/api/hardware/peso"

Write-Host ""
Write-Host "=== BALANCA -> SISTEMA ===" -ForegroundColor Cyan
Write-Host "Enviando para: $apiUrl"
Write-Host "Deixe esta janela aberta (pode minimizar). Ctrl+C para parar."
Write-Host "Balanca precisa estar VAZIA quando liga, caso ainda nao tenha sido calibrada."

while ($true) {
  $porta = $PortName
  if (-not $porta) {
    $achado = Find-ArduinoPort
    if ($achado) {
      $porta = $achado.Porta
      Write-Host "Arduino encontrado: $($achado.Nome)" -ForegroundColor Green
    }
  }

  if (-not $porta) {
    Write-Host "Arduino nao encontrado. Conecte o cabo USB... (tentando de novo em 5s)" -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    continue
  }

  try {
    & $ponte -PortName $porta -ApiUrl $apiUrl -ApiKey $config.ApiKey
  } catch {
    Write-Host "Conexao interrompida: $($_.Exception.Message)" -ForegroundColor Yellow
  }

  Write-Host "Reconectando em 3s..." -ForegroundColor Yellow
  Start-Sleep -Seconds 3
}
