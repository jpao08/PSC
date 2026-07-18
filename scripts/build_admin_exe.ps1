param(
  [string]$Name = "PSC-Users-Admin",
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

$entryPoint = Join-Path $projectRoot "src\admin\users_app.py"
if (-not (Test-Path $entryPoint)) {
  throw "Entrypoint do admin nao encontrado em: $entryPoint"
}

$arguments = @(
  "-m", "PyInstaller",
  "--noconfirm",
  "--onefile",
  "--name", $Name,
  "--paths", "src",
  "--add-data", "admin_web;admin_web"
)

if ($Console) {
  $arguments += "--console"
  Write-Host "[build-admin] Modo console habilitado." -ForegroundColor Yellow
} else {
  $arguments += "--noconsole"
  Write-Host "[build-admin] Modo sem terminal (duplo clique amigavel)." -ForegroundColor Yellow
}

if (-not $NoClean) {
  $arguments += "--clean"
}

if (-not $NoEnvBundle) {
  if (Test-Path ".env") {
    $arguments += @("--add-data", ".env;.")
    Write-Host "[build-admin] Incluindo .env no executavel." -ForegroundColor Yellow
  } else {
    Write-Host "[build-admin] .env nao encontrado, seguindo sem empacotar .env." -ForegroundColor Yellow
  }
}

$arguments += @(
  "--hidden-import", "dotenv",
  "--hidden-import", "admin.users_app",
  "src\admin\users_app.py"
)

Write-Host "[build-admin] Iniciando build one-file do admin..." -ForegroundColor Cyan
& $pythonExe @arguments

if ($LASTEXITCODE -ne 0) {
  throw "Build do admin falhou com codigo de saida $LASTEXITCODE"
}

$exePath = Join-Path $projectRoot "dist\$Name.exe"
Write-Host "[build-admin] Concluido: $exePath" -ForegroundColor Green
Write-Host "[build-admin] Duplo clique em $exePath para iniciar na porta 8020 com navegador automatico." -ForegroundColor Green
Write-Host "[build-admin] Opcional via terminal: .\dist\$Name.exe --port 8020 --open-browser" -ForegroundColor Green
