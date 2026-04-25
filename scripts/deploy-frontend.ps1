param(
  [string]$AppDir = $env:APP_DIR,
  [string]$ProjectId = $env:PROJECT_ID,
  [string]$AwsAccessKeyId = $env:AWS_ACCESS_KEY_ID,
  [string]$AwsSecretAccessKey = $env:AWS_SECRET_ACCESS_KEY,
  [string]$AwsDefaultRegion = $env:AWS_DEFAULT_REGION,
  [string]$ExistingBucketName = $env:EXISTING_BUCKET_NAME,
  [string]$ExistingDistributionId = $env:EXISTING_DISTRIBUTION_ID
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

function Write-Utf8NoBomFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Test-DnsResolution {
  param([string]$HostName)

  try {
    [System.Net.Dns]::GetHostAddresses($HostName) | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Resolve-S3WebsiteEndpoint {
  param(
    [string]$BucketName,
    [string]$Region
  )

  $candidates = @(
    "$BucketName.s3-website-$Region.amazonaws.com",
    "$BucketName.s3-website.$Region.amazonaws.com"
  ) | Select-Object -Unique

  foreach ($candidate in $candidates) {
    if (Test-DnsResolution -HostName $candidate) {
      return $candidate
    }
  }

  $legacyDashRegions = @(
    "us-east-1",
    "us-west-1",
    "us-west-2",
    "ap-southeast-1",
    "ap-southeast-2",
    "ap-northeast-1",
    "eu-west-1",
    "sa-east-1"
  )

  if ($legacyDashRegions -contains $Region) {
    return "$BucketName.s3-website-$Region.amazonaws.com"
  }

  return "$BucketName.s3-website.$Region.amazonaws.com"
}

function Wait-CloudFrontDistribution {
  param([string]$DistributionId)

  if ([string]::IsNullOrWhiteSpace($DistributionId)) {
    throw "CloudFront distribution ID is required before waiting for deployment."
  }

  Write-Output "Waiting for CloudFront distribution $DistributionId to reach Deployed state"
  Invoke-ExternalCommand -Command "aws" -Arguments @(
    "cloudfront",
    "wait",
    "distribution-deployed",
    "--id",
    $DistributionId
  )
}

function Update-CloudFrontOriginIfNeeded {
  param(
    [string]$DistributionId,
    [string]$OriginDomainName
  )

  $configResponse = (Invoke-ExternalCapture -Command "aws" -Arguments @(
    "cloudfront",
    "get-distribution-config",
    "--id",
    $DistributionId,
    "--output",
    "json"
  )).Output | ConvertFrom-Json

  if ($configResponse.DistributionConfig.Origins.Quantity -lt 1) {
    throw "CloudFront distribution $DistributionId does not have an origin to update."
  }

  $distributionConfig = $configResponse.DistributionConfig
  $origin = $distributionConfig.Origins.Items[0]
  $needsUpdate = $false

  if ($origin.DomainName -ne $OriginDomainName) {
    $origin.DomainName = $OriginDomainName
    $needsUpdate = $true
  }

  if ($origin.CustomOriginConfig.OriginProtocolPolicy -ne "http-only") {
    $origin.CustomOriginConfig.OriginProtocolPolicy = "http-only"
    $needsUpdate = $true
  }

  if (-not $needsUpdate) {
    return
  }

  Write-Output "Updating CloudFront origin to $OriginDomainName"
  $distributionConfigFile = [System.IO.Path]::GetTempFileName()

  try {
    Write-Utf8NoBomFile -Path $distributionConfigFile -Content ($distributionConfig | ConvertTo-Json -Depth 20)
    $distributionUri = "file://$($distributionConfigFile -replace '\\', '/')"

    Invoke-ExternalCommand -Command "aws" -Arguments @(
      "cloudfront",
      "update-distribution",
      "--id",
      $DistributionId,
      "--if-match",
      $configResponse.ETag,
      "--distribution-config",
      $distributionUri
    )
  } finally {
    Remove-Item $distributionConfigFile -ErrorAction SilentlyContinue
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
    Output = ($result.StdOut + "`n" + $result.StdErr).Trim()
  }
}

$appDir = Require-Value "APP_DIR" $AppDir
$projectId = Require-Value "PROJECT_ID" $ProjectId
$null = Require-Value "AWS_ACCESS_KEY_ID" $AwsAccessKeyId
$null = Require-Value "AWS_SECRET_ACCESS_KEY" $AwsSecretAccessKey
$region = Require-Value "AWS_DEFAULT_REGION" $AwsDefaultRegion

Set-Location $appDir

Write-Output "Installing frontend dependencies"
Invoke-ExternalCommand -Command "npm.cmd" -Arguments @("install")

Write-Output "Building frontend application"
Invoke-ExternalCommand -Command "npm.cmd" -Arguments @("run", "build")

$buildDir = @("dist", "build", "out") |
  ForEach-Object { Join-Path $appDir $_ } |
  Where-Object { Test-Path $_ -PathType Container } |
  Select-Object -First 1

if (-not $buildDir) {
  throw "Unable to find a supported build output directory (dist, build, or out)."
}

$bucketName = if ([string]::IsNullOrWhiteSpace($ExistingBucketName)) { "dp-$projectId" } else { $ExistingBucketName }
$websiteEndpoint = Resolve-S3WebsiteEndpoint -BucketName $bucketName -Region $region
Write-Output "Using S3 website endpoint $websiteEndpoint"

$bucketCheck = Invoke-ExternalCapture -Command "aws" -Arguments @("s3api", "head-bucket", "--bucket", $bucketName) -AllowFailure
if ($bucketCheck.ExitCode -eq 0) {
  Write-Output "Reusing S3 bucket $bucketName"
} else {
  Write-Output "Creating S3 bucket $bucketName"
  if ($region -eq "us-east-1") {
    Invoke-ExternalCommand -Command "aws" -Arguments @("s3api", "create-bucket", "--bucket", $bucketName)
  } else {
    Invoke-ExternalCommand -Command "aws" -Arguments @(
      "s3api",
      "create-bucket",
      "--bucket",
      $bucketName,
      "--create-bucket-configuration",
      "LocationConstraint=$region"
    )
  }
}

Invoke-ExternalCommand -Command "aws" -Arguments @(
  "s3",
  "website",
  "s3://$bucketName",
  "--index-document",
  "index.html",
  "--error-document",
  "index.html"
)

Invoke-ExternalCommand -Command "aws" -Arguments @(
  "s3api",
  "put-public-access-block",
  "--bucket",
  $bucketName,
  "--public-access-block-configuration",
  "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"
)

$policyFile = [System.IO.Path]::GetTempFileName()
$policyJson = @{
  Version = "2012-10-17"
  Statement = @(
    @{
      Sid = "PublicReadGetObject"
      Effect = "Allow"
      Principal = "*"
      Action = @("s3:GetObject")
      Resource = @("arn:aws:s3:::$bucketName/*")
    }
  )
} | ConvertTo-Json -Depth 8

Write-Utf8NoBomFile -Path $policyFile -Content $policyJson

try {
  $policyUri = "file://$($policyFile -replace '\\', '/')"
  Invoke-ExternalCommand -Command "aws" -Arguments @(
    "s3api",
    "put-bucket-policy",
    "--bucket",
    $bucketName,
    "--policy",
    $policyUri
  )

  Write-Output "Uploading build artifacts to s3://$bucketName"
  Invoke-ExternalCommand -Command "aws" -Arguments @(
    "s3",
    "sync",
    $buildDir,
    "s3://$bucketName",
    "--delete"
  )

  $distributionId = $ExistingDistributionId
  $distributionDomain = ""

  if (-not [string]::IsNullOrWhiteSpace($distributionId)) {
    Write-Output "Reusing CloudFront distribution $distributionId"
    Update-CloudFrontOriginIfNeeded -DistributionId $distributionId -OriginDomainName $websiteEndpoint
    $distributionDomain = (Invoke-ExternalCapture -Command "aws" -Arguments @(
      "cloudfront",
      "get-distribution",
      "--id",
      $distributionId,
      "--query",
      "Distribution.DomainName",
      "--output",
      "text"
    )).Output.Trim()

    Invoke-ExternalCommand -Command "aws" -Arguments @(
      "cloudfront",
      "create-invalidation",
      "--distribution-id",
      $distributionId,
      "--paths",
      "/*"
    )
  } else {
    Write-Output "Creating CloudFront distribution"

    $distributionConfig = @{
      CallerReference = "$projectId-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
      Comment = "Deploy Platform frontend $projectId"
      Enabled = $true
      DefaultRootObject = "index.html"
      Origins = @{
        Quantity = 1
        Items = @(
          @{
            Id = "s3-website-origin"
            DomainName = $websiteEndpoint
            CustomOriginConfig = @{
              HTTPPort = 80
              HTTPSPort = 443
              OriginProtocolPolicy = "http-only"
              OriginSslProtocols = @{
                Quantity = 3
                Items = @("TLSv1", "TLSv1.1", "TLSv1.2")
              }
            }
          }
        )
      }
      DefaultCacheBehavior = @{
        TargetOriginId = "s3-website-origin"
        ViewerProtocolPolicy = "redirect-to-https"
        TrustedSigners = @{
          Enabled = $false
          Quantity = 0
        }
        ForwardedValues = @{
          QueryString = $true
          Cookies = @{
            Forward = "all"
          }
        }
        AllowedMethods = @{
          Quantity = 2
          Items = @("GET", "HEAD")
          CachedMethods = @{
            Quantity = 2
            Items = @("GET", "HEAD")
          }
        }
        Compress = $true
        MinTTL = 0
        DefaultTTL = 3600
        MaxTTL = 86400
      }
      CacheBehaviors = @{
        Quantity = 0
      }
      CustomErrorResponses = @{
        Quantity = 2
        Items = @(
          @{
            ErrorCode = 403
            ResponsePagePath = "/index.html"
            ResponseCode = "200"
            ErrorCachingMinTTL = 0
          },
          @{
            ErrorCode = 404
            ResponsePagePath = "/index.html"
            ResponseCode = "200"
            ErrorCachingMinTTL = 0
          }
        )
      }
      Restrictions = @{
        GeoRestriction = @{
          RestrictionType = "none"
          Quantity = 0
        }
      }
      ViewerCertificate = @{
        CloudFrontDefaultCertificate = $true
      }
      PriceClass = "PriceClass_100"
    } | ConvertTo-Json -Depth 12

    $distributionConfigFile = [System.IO.Path]::GetTempFileName()
    Write-Utf8NoBomFile -Path $distributionConfigFile -Content $distributionConfig

    try {
      $distributionUri = "file://$($distributionConfigFile -replace '\\', '/')"
      $distributionJson = (Invoke-ExternalCapture -Command "aws" -Arguments @(
        "cloudfront",
        "create-distribution",
        "--distribution-config",
        $distributionUri,
        "--output",
        "json"
      )).Output

      $distribution = $distributionJson | ConvertFrom-Json
      $distributionId = $distribution.Distribution.Id
      $distributionDomain = $distribution.Distribution.DomainName
    } finally {
      Remove-Item $distributionConfigFile -ErrorAction SilentlyContinue
    }
  }

  Wait-CloudFrontDistribution -DistributionId $distributionId

  $distributionDomain = (Invoke-ExternalCapture -Command "aws" -Arguments @(
    "cloudfront",
    "get-distribution",
    "--id",
    $distributionId,
    "--query",
    "Distribution.DomainName",
    "--output",
    "text"
  )).Output.Trim()

  Write-Output "RESULT_BUCKET_NAME=$bucketName"
  Write-Output "RESULT_DISTRIBUTION_ID=$distributionId"
  Write-Output "RESULT_DISTRIBUTION_DOMAIN=$distributionDomain"
  Write-Output "RESULT_PUBLIC_URL=https://$distributionDomain"
} finally {
  Remove-Item $policyFile -ErrorAction SilentlyContinue
}
