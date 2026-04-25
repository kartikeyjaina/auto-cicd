param(
  [string]$AppDir = $env:APP_DIR,
  [string]$EnvFile = $env:ENV_FILE,
  [string]$PrivateKeyPath = $env:PRIVATE_KEY_PATH,
  [string]$ProjectId = $env:PROJECT_ID,
  [string]$ProjectSlug = $env:PROJECT_SLUG,
  [string]$AppPort = $env:APP_PORT,
  [string]$StartCommand = $env:START_COMMAND,
  [string]$AwsAccessKeyId = $env:AWS_ACCESS_KEY_ID,
  [string]$AwsSecretAccessKey = $env:AWS_SECRET_ACCESS_KEY,
  [string]$AwsDefaultRegion = "eu-west-2",
  [string]$BackendAmiId = $env:BACKEND_AMI_ID,
  [string]$ExistingInstanceId = $env:EXISTING_INSTANCE_ID,
  [string]$ExistingKeyName = $env:EXISTING_KEY_NAME
)

$ErrorActionPreference = "Stop"

function Require-Value {
  param(
    [string]$Name,
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "Missing required setting: $Name"
  }

  return $Value
}

function Format-ProcessArgument {
  param([string]$Value)

  if ($null -eq $Value) {
    return '""'
  }

  if ($Value -notmatch '[\s"]') {
    return $Value
  }

  $escaped = $Value -replace '(\\*)"', '$1$1\"'
  $escaped = $escaped -replace '(\\+)$', '$1$1'
  return '"' + $escaped + '"'
}

function Resolve-ProcessInvocation {
  param(
    [string]$Command,
    [string[]]$Arguments
  )

  if ($Command -match '\.(cmd|bat)$') {
    $joined = (($Arguments | ForEach-Object { Format-ProcessArgument $_ }) -join " ")
    return [PSCustomObject]@{
      FileName = "cmd.exe"
      Arguments = "/d /s /c " + (Format-ProcessArgument "$Command $joined")
    }
  }

  return [PSCustomObject]@{
    FileName = $Command
    Arguments = (($Arguments | ForEach-Object { Format-ProcessArgument $_ }) -join " ")
  }
}

function Invoke-ExternalCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [switch]$AllowFailure
  )

  $result = Invoke-ExternalProcess -Command $Command -Arguments $Arguments
  if (-not $AllowFailure -and $result.ExitCode -ne 0) {
    $details = ($result.StdErr + "`n" + $result.StdOut).Trim()
    if ($details) {
      throw "$Command exited with code $($result.ExitCode)`n$details"
    }
    throw "$Command exited with code $($result.ExitCode)"
  }

  return $result.ExitCode
}

function Invoke-ExternalProcess {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [switch]$Quiet
  )

  $invocation = Resolve-ProcessInvocation -Command $Command -Arguments $Arguments
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $invocation.FileName
  $startInfo.Arguments = $invocation.Arguments
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.CreateNoWindow = $true

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo

  [void]$process.Start()
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  $process.WaitForExit()

  if (-not $Quiet) {
    foreach ($line in ($stdout -split "\r?\n")) {
      if (-not [string]::IsNullOrWhiteSpace($line)) {
        Write-Output $line
      }
    }

    foreach ($line in ($stderr -split "\r?\n")) {
      if (-not [string]::IsNullOrWhiteSpace($line)) {
        Write-Output $line
      }
    }
  }

  return [PSCustomObject]@{
    ExitCode = $process.ExitCode
    StdOut = $stdout
    StdErr = $stderr
  }
}

function Invoke-ExternalCapture {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [switch]$AllowFailure
  )

  $result = Invoke-ExternalProcess -Command $Command -Arguments $Arguments -Quiet
  if (-not $AllowFailure -and $result.ExitCode -ne 0) {
    $message = ($result.StdErr + "`n" + $result.StdOut).Trim()
    if (-not $message) {
      $message = "$Command exited with code $($result.ExitCode)"
    }
    throw $message
  }

  return [PSCustomObject]@{
    ExitCode = $result.ExitCode
    StdOut = $result.StdOut.Trim()
    StdErr = $result.StdErr.Trim()
    Output = ($result.StdOut + "`n" + $result.StdErr).Trim()
  }
}

function Invoke-SshCommand {
  param(
    [Parameter(Mandatory = $true)][string]$PrivateKeyPath,
    [Parameter(Mandatory = $true)][string]$RemoteHost,
    [Parameter(Mandatory = $true)][string]$RemoteCommand
  )

  Invoke-ExternalCommand -Command "ssh" -Arguments @(
    "-i",
    $PrivateKeyPath,
    "-o",
    "StrictHostKeyChecking=no",
    $RemoteHost,
    $RemoteCommand
  )
}

function Protect-PrivateKeyFile {
  param([string]$Path)

  if (-not (Test-Path $Path -PathType Leaf)) {
    throw "Private key file not found at $Path"
  }

  if ($IsWindows -or $env:OS -eq "Windows_NT") {
    $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    Invoke-ExternalCommand -Command "icacls.exe" -Arguments @($Path, "/inheritance:r")
    Invoke-ExternalCommand -Command "icacls.exe" -Arguments @($Path, "/grant:r", "${currentUser}:R")
    Invoke-ExternalCommand -Command "icacls.exe" -Arguments @($Path, "/remove:g", "Users", "Authenticated Users", "Everyone", "BUILTIN\\Users")
    return
  }

  Invoke-ExternalCommand -Command "chmod" -Arguments @("600", $Path)
}

function Resolve-BackendAmi {
  param([string]$PreferredAmiId)

  if (-not [string]::IsNullOrWhiteSpace($PreferredAmiId)) {
    return $PreferredAmiId.Trim()
  }

  $ssmResult = Invoke-ExternalCapture -Command "aws" -Arguments @(
    "ssm",
    "get-parameter",
    "--name",
    "/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id",
    "--query",
    "Parameter.Value",
    "--output",
    "text"
  ) -AllowFailure

  $ssmAmiId = $ssmResult.StdOut
  if ($ssmResult.ExitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace($ssmAmiId)) {
    return $ssmAmiId
  }

  $imageId = (Invoke-ExternalCapture -Command "aws" -Arguments @(
    "ec2",
    "describe-images",
    "--owners",
    "099720109477",
    "--filters",
    "Name=name,Values=ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*",
    "Name=architecture,Values=x86_64",
    "Name=state,Values=available",
    "Name=root-device-type,Values=ebs",
    "Name=virtualization-type,Values=hvm",
    "--query",
    "sort_by(Images,&CreationDate)[-1].ImageId",
    "--output",
    "text"
  )).StdOut

  if ([string]::IsNullOrWhiteSpace($imageId) -or $imageId -eq "None") {
    throw "Unable to resolve an Ubuntu 24.04 AMI. Set BACKEND_AMI_ID in worker/.env or grant ssm:GetParameter / ec2:DescribeImages."
  }

  return $imageId
}

function New-UniqueKeyName {
  param([string]$BaseKeyName)

  $suffix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  return "$BaseKeyName-$suffix"
}

$appDir = Require-Value "APP_DIR" $AppDir
$envFile = Require-Value "ENV_FILE" $EnvFile
$privateKeyPath = Require-Value "PRIVATE_KEY_PATH" $PrivateKeyPath
$projectId = Require-Value "PROJECT_ID" $ProjectId
$projectSlug = Require-Value "PROJECT_SLUG" $ProjectSlug
$appPort = Require-Value "APP_PORT" $AppPort
$startCommand = Require-Value "START_COMMAND" $StartCommand
$null = Require-Value "AWS_ACCESS_KEY_ID" $AwsAccessKeyId
$null = Require-Value "AWS_SECRET_ACCESS_KEY" $AwsSecretAccessKey
$null = Require-Value "AWS_DEFAULT_REGION" $AwsDefaultRegion

$sshUser = "ubuntu"
$instanceId = $ExistingInstanceId
$keyName = $ExistingKeyName
$securityGroupName = "deploy-platform-$projectId"
$appDirRemote = "/var/www/$projectSlug"

$defaultVpcId = (Invoke-ExternalCapture -Command "aws" -Arguments @(
  "ec2",
  "describe-vpcs",
  "--filters",
  "Name=isDefault,Values=true",
  "--query",
  "Vpcs[0].VpcId",
  "--output",
  "text"
)).Output.Trim()
if ([string]::IsNullOrWhiteSpace($defaultVpcId) -or $defaultVpcId -eq "None") {
  throw "Unable to determine the default VPC."
}

$securityGroupIdResult = Invoke-ExternalCapture -Command "aws" -Arguments @(
  "ec2",
  "describe-security-groups",
  "--filters",
  "Name=group-name,Values=$securityGroupName",
  "Name=vpc-id,Values=$defaultVpcId",
  "--query",
  "SecurityGroups[0].GroupId",
  "--output",
  "text"
) -AllowFailure

$securityGroupId = ($securityGroupIdResult.Output | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($securityGroupId) -or $securityGroupId -eq "None") {
  Write-Output "Creating security group $securityGroupName"
  $securityGroupId = (Invoke-ExternalCapture -Command "aws" -Arguments @(
    "ec2",
    "create-security-group",
    "--group-name",
    $securityGroupName,
    "--description",
    "Deploy Platform access for $projectId",
    "--vpc-id",
    $defaultVpcId,
    "--query",
    "GroupId",
    "--output",
    "text"
  )).Output.Trim()
}

Invoke-ExternalCommand -Command "aws" -Arguments @(
  "ec2",
  "authorize-security-group-ingress",
  "--group-id",
  $securityGroupId,
  "--protocol",
  "tcp",
  "--port",
  "22",
  "--cidr",
  "0.0.0.0/0"
) -AllowFailure | Out-Null

Invoke-ExternalCommand -Command "aws" -Arguments @(
  "ec2",
  "authorize-security-group-ingress",
  "--group-id",
  $securityGroupId,
  "--protocol",
  "tcp",
  "--port",
  $appPort,
  "--cidr",
  "0.0.0.0/0"
) -AllowFailure | Out-Null

if ([string]::IsNullOrWhiteSpace($keyName)) {
  $baseKeyName = "dp-$projectId-key"
  $keyName = $baseKeyName
  Write-Output "Generating new key pair $keyName"
  $keyResult = Invoke-ExternalCapture -Command "aws" -Arguments @(
    "ec2",
    "create-key-pair",
    "--key-name",
    $keyName,
    "--query",
    "KeyMaterial",
    "--output",
    "text"
  ) -AllowFailure

  if ($keyResult.ExitCode -ne 0) {
    if ($keyResult.Output -match "InvalidKeyPair\.Duplicate") {
      $keyName = New-UniqueKeyName -BaseKeyName $baseKeyName
      Write-Output "Key pair already exists, generating replacement key pair $keyName"
      $keyResult = Invoke-ExternalCapture -Command "aws" -Arguments @(
        "ec2",
        "create-key-pair",
        "--key-name",
        $keyName,
        "--query",
        "KeyMaterial",
        "--output",
        "text"
      )
    } else {
      throw $keyResult.Output
    }
  }

  $keyMaterial = $keyResult.Output
  Set-Content -Path $privateKeyPath -Value $keyMaterial -Encoding ascii
}

if (-not (Test-Path $privateKeyPath -PathType Leaf)) {
  throw "Private key file not found at $privateKeyPath"
}

Protect-PrivateKeyFile -Path $privateKeyPath

if ([string]::IsNullOrWhiteSpace($instanceId)) {
  Write-Output "Launching EC2 instance"
  $amiId = Resolve-BackendAmi -PreferredAmiId $BackendAmiId

  $instanceId = (Invoke-ExternalCapture -Command "aws" -Arguments @(
    "ec2",
    "run-instances",
    "--image-id",
    $amiId,
    "--instance-type",
    "t3.micro",
    "--key-name",
    $keyName,
    "--security-group-ids",
    $securityGroupId,
    "--tag-specifications",
    "ResourceType=instance,Tags=[{Key=Name,Value=$projectSlug}]",
    "--query",
    "Instances[0].InstanceId",
    "--output",
    "text"
  )).Output.Trim()
}

Write-Output "Waiting for EC2 instance $instanceId"
Invoke-ExternalCommand -Command "aws" -Arguments @("ec2", "wait", "instance-running", "--instance-ids", $instanceId)
Invoke-ExternalCommand -Command "aws" -Arguments @("ec2", "wait", "instance-status-ok", "--instance-ids", $instanceId)

$publicIp = (Invoke-ExternalCapture -Command "aws" -Arguments @(
  "ec2",
  "describe-instances",
  "--instance-ids",
  $instanceId,
  "--query",
  "Reservations[0].Instances[0].PublicIpAddress",
  "--output",
  "text"
)).Output.Trim()
if ([string]::IsNullOrWhiteSpace($publicIp) -or $publicIp -eq "None") {
  throw "Failed to resolve a public IP for instance $instanceId"
}

$remoteHost = "$sshUser@$publicIp"

Write-Output "Preparing remote host $remoteHost"
$prepareRemoteCommand = "sudo mkdir -p '$appDirRemote' && sudo chown -R $sshUser`:$sshUser '$appDirRemote'"
Invoke-SshCommand -PrivateKeyPath $privateKeyPath -RemoteHost $remoteHost -RemoteCommand $prepareRemoteCommand

Write-Output "Copying application files"
Invoke-ExternalCommand -Command "scp" -Arguments @(
  "-i",
  $privateKeyPath,
  "-o",
  "StrictHostKeyChecking=no",
  "-r",
  (Join-Path $appDir "."),
  "$remoteHost`:$appDirRemote/"
)

Invoke-ExternalCommand -Command "scp" -Arguments @(
  "-i",
  $privateKeyPath,
  "-o",
  "StrictHostKeyChecking=no",
  $envFile,
  "$remoteHost`:$appDirRemote/.env"
)

Write-Output "Installing runtime and starting application"
$remoteRuntimeScript = @"
set -e
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get update
  sudo apt-get install -y nodejs build-essential
fi
if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
fi
cd '$appDirRemote'
npm install --omit=dev
pm2 delete '$projectSlug' >/dev/null 2>&1 || true
pm2 start sh --name '$projectSlug' -- -lc '$startCommand'
pm2 save
"@
Invoke-SshCommand -PrivateKeyPath $privateKeyPath -RemoteHost $remoteHost -RemoteCommand $remoteRuntimeScript

Write-Output "RESULT_INSTANCE_ID=$instanceId"
Write-Output "RESULT_PUBLIC_IP=$publicIp"
Write-Output "RESULT_KEY_NAME=$keyName"
Write-Output "RESULT_SSH_USER=$sshUser"
Write-Output "RESULT_PUBLIC_URL=http://$publicIp`:$appPort"
