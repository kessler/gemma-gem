$port = if ($env:GEMMA_GEM_BRIDGE_PORT) { [int]$env:GEMMA_GEM_BRIDGE_PORT } else { 41587 }
$connections = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $port -State Listen -ErrorAction SilentlyContinue

if (-not $connections) {
  Write-Host "No Gemma Gem bridge sidecar is listening on 127.0.0.1:$port."
  exit 0
}
foreach ($connection in $connections) {
  $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
  if ($process -and $process.ProcessName -eq 'node') {
    Stop-Process -Id $process.Id -Force
    Write-Host "Stopped Gemma Gem bridge sidecar on 127.0.0.1:$port (PID $($process.Id))."
  } elseif ($process) {
    Write-Host "Refusing to stop PID $($process.Id) ($($process.ProcessName)) on 127.0.0.1:$port because it is not node."
  }
}
