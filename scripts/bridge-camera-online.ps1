param(
  [Parameter(Mandatory = $true)]
  [string]$RtspUrl,

  [Parameter(Mandatory = $true)]
  [int]$CameraId,

  [string]$ApiUrl = $env:HARDWARE_API_URL,
  [string]$ApiKey = $env:HARDWARE_API_KEY,
  [int]$IntervalSeconds = 2,
  [string]$FfmpegPath
)

if ([string]::IsNullOrWhiteSpace($ApiUrl)) {
  throw "Informe -ApiUrl ou defina HARDWARE_API_URL. Ex: https://ecoengineers.azurewebsites.net"
}
if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "Informe -ApiKey ou defina HARDWARE_API_KEY com a mesma chave configurada no backend online."
}

if ([string]::IsNullOrWhiteSpace($FfmpegPath)) {
  $bundled = Join-Path $PSScriptRoot "..\node_modules\ffmpeg-static\ffmpeg.exe"
  if (Test-Path $bundled) {
    $FfmpegPath = (Resolve-Path $bundled).Path
  } else {
    $FfmpegPath = "ffmpeg"
  }
}

$pushUrl = "$($ApiUrl.TrimEnd('/'))/api/cameras/$CameraId/push-frame"
$tempFrame = Join-Path $env:TEMP "eco-camera-$CameraId.jpg"

Add-Type -AssemblyName System.Net.Http
$httpClient = [System.Net.Http.HttpClient]::new()
$httpClient.Timeout = [TimeSpan]::FromSeconds(15)

function Send-Frame([string]$FilePath) {
  $bytes = [System.IO.File]::ReadAllBytes($FilePath)
  $content = [System.Net.Http.MultipartFormDataContent]::new()
  $fileContent = [System.Net.Http.ByteArrayContent]::new($bytes)
  $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("image/jpeg")
  $content.Add($fileContent, "imagem", "frame.jpg")

  $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post, $pushUrl)
  $request.Headers.Add("x-api-key", $ApiKey)
  $request.Content = $content

  $response = $httpClient.SendAsync($request).GetAwaiter().GetResult()
  if (-not $response.IsSuccessStatusCode) {
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    throw "Servidor respondeu $($response.StatusCode): $body"
  }
}

Write-Host "Lendo RTSP e enviando frames a cada $IntervalSeconds s para $pushUrl"
Write-Host "Usando ffmpeg: $FfmpegPath"
Write-Host "Deixe esta janela aberta enquanto quiser a câmera ao vivo no site. Ctrl+C para parar."

while ($true) {
  try {
    if (Test-Path $tempFrame) { Remove-Item $tempFrame -Force }

    & $FfmpegPath -y -rtsp_transport tcp -timeout 8000000 -i $RtspUrl -frames:v 1 $tempFrame *> $null

    if (Test-Path $tempFrame) {
      Send-Frame -FilePath $tempFrame
      Write-Host "$(Get-Date -Format 'HH:mm:ss') — frame enviado"
    } else {
      Write-Warning "Não foi possível capturar frame da câmera (verifique IP/chave/rede)."
    }
  } catch {
    Write-Warning $_.Exception.Message
  }

  Start-Sleep -Seconds $IntervalSeconds
}
