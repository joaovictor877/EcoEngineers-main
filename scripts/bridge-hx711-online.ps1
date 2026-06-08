param(
  [Parameter(Mandatory = $true)]
  [string]$PortName,

  [string]$ApiUrl = $env:HARDWARE_API_URL,
  [string]$ApiKey = $env:HARDWARE_API_KEY,
  [int]$BaudRate = 57600,
  [int]$MinIntervalMs = 600,
  [double]$MinDeltaKg = 0.02,
  [double]$ZeroBelowKg = 0.03,
  [double]$MaxNegativeKg = -0.25
)

if ([string]::IsNullOrWhiteSpace($ApiUrl)) {
  throw "Informe -ApiUrl ou defina HARDWARE_API_URL. Ex: https://seu-site.com/api/hardware/peso"
}

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
  throw "Informe -ApiKey ou defina HARDWARE_API_KEY com a mesma chave configurada no backend online."
}

Add-Type -AssemblyName System.IO.Ports

$serial = [System.IO.Ports.SerialPort]::new($PortName, $BaudRate)
$serial.NewLine = "`n"
$serial.ReadTimeout = 1500

$headers = @{
  "x-api-key" = $ApiKey
}

$lastSentAt = [DateTime]::MinValue
$lastSentWeight = $null
$lastHx711WarningAt = [DateTime]::MinValue

try {
  $serial.Open()
  Write-Host "Lendo $PortName em $BaudRate baud e enviando para $ApiUrl"
  Write-Host "Deixe esta janela aberta durante a apresentacao. Ctrl+C para parar."

  while ($true) {
    try {
      $line = $serial.ReadLine().Trim()
      if ([string]::IsNullOrWhiteSpace($line)) { continue }

      try {
        $reading = $line | ConvertFrom-Json -ErrorAction Stop
      } catch {
        Write-Host "Serial ignorado: $line"
        continue
      }

      if ($null -eq $reading.peso) {
        if ($reading.status) { Write-Host "Arduino: $($reading.status)" }
        if ($reading.error) {
          $now = Get-Date
          if (($now - $lastHx711WarningAt).TotalSeconds -ge 4) {
            Write-Warning "Arduino: $($reading.error)"
            $lastHx711WarningAt = $now
          }
        }
        continue
      }

      $weight = [double]$reading.peso
      if ($weight -lt 0 -and $weight -ge -$ZeroBelowKg) {
        $weight = 0
      }
      if ($weight -lt $MaxNegativeKg) {
        Write-Warning ("Leitura negativa ignorada: {0:N3} kg" -f $weight)
        continue
      }
      if ($weight -lt 0) {
        $weight = 0
      }

      $now = Get-Date
      $elapsedMs = ($now - $lastSentAt).TotalMilliseconds
      $changedEnough = $null -eq $lastSentWeight -or [Math]::Abs($weight - $lastSentWeight) -ge $MinDeltaKg

      if ($elapsedMs -lt $MinIntervalMs -and -not $changedEnough) {
        continue
      }

      $body = @{
        peso = [Math]::Round($weight, 3)
        dispositivo = if ($reading.dispositivo) { [string]$reading.dispositivo } else { "Arduino UNO HX711" }
      } | ConvertTo-Json -Compress

      Invoke-RestMethod -Uri $ApiUrl -Method Post -Headers $headers -ContentType "application/json" -Body $body | Out-Null

      $lastSentAt = $now
      $lastSentWeight = $weight
      Write-Host ("Peso enviado: {0:N3} kg" -f $weight)
    } catch [System.TimeoutException] {
      continue
    } catch {
      Write-Warning $_.Exception.Message
      Start-Sleep -Milliseconds 900
    }
  }
} finally {
  if ($serial.IsOpen) { $serial.Close() }
}
