param(
  [string]$Name = "PSC",
  [switch]$NoEnvBundle,
  [switch]$NoClean,
  [switch]$Console
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $projectRoot

$pythonExe = Join-Path $projectRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
  throw "Python da venv nao encontrado em: $pythonExe"
}

$entryPoint = Join-Path $projectRoot "src\app\start_server.py"
if (-not (Test-Path $entryPoint)) {
  throw "Entrypoint nao encontrado em: $entryPoint"
}

$arguments = @(
  "-m", "PyInstaller",
  "--noconfirm",
  "--onefile",
  "--name", $Name,
  "--paths", "src",
  "--add-data", "web;web"
)

if ($Console) {
  $arguments += "--console"
  Write-Host "[build] Modo console habilitado." -ForegroundColor Yellow
} else {
  $arguments += "--noconsole"
  Write-Host "[build] Modo sem terminal (duplo clique amigavel)." -ForegroundColor Yellow
}

if (-not $NoClean) {
  $arguments += "--clean"
}

if (-not $NoEnvBundle) {
  if (Test-Path ".env") {
    $arguments += @("--add-data", ".env;.")
    Write-Host "[build] Incluindo .env no executavel." -ForegroundColor Yellow
  } else {
    Write-Host "[build] .env nao encontrado, seguindo sem empacotar .env." -ForegroundColor Yellow
  }
}

$arguments += @(
  "--hidden-import", "dotenv",
  "--hidden-import", "app.main",
  "src\app\start_server.py"
)

Write-Host "[build] Iniciando build one-file com PyInstaller..." -ForegroundColor Cyan
& $pythonExe @arguments

if ($LASTEXITCODE -ne 0) {
  throw "Build falhou com codigo de saida $LASTEXITCODE"
}

$exePath = Join-Path $projectRoot "dist\$Name.exe"
Write-Host "[build] Concluido: $exePath" -ForegroundColor Green
Write-Host "[build] Duplo clique em $exePath para iniciar na porta 8010 com navegador automatico." -ForegroundColor Green
Write-Host "[build] Opcional via terminal: .\dist\$Name.exe --port 8010 --open-browser" -ForegroundColor Green
