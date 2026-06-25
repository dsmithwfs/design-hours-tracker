param(
    [Parameter(Mandatory)][string]$JsonPath,
    [Parameter(Mandatory)][string]$TemplatePath
)

if (-not (Test-Path $JsonPath))    { Write-Error "JSON not found: $JsonPath";    exit 1 }
if (-not (Test-Path $TemplatePath)){ Write-Error "Template not found: $TemplatePath"; exit 1 }

$data = Get-Content $JsonPath -Raw | ConvertFrom-Json
$jobs = @($data.jobs)

function SanitizeStr($s) {
    $s = [string]$s
    if ($s -match '^[=+\-@\t\r]') { return "'" + $s }
    return $s
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible       = $false
$excel.DisplayAlerts = $false

$wb = $excel.Workbooks.Open($TemplatePath)
$ws = $wb.Worksheets.Item(1)

function SetCell($ws, $row, $col, $val) {
    $addr = "$([char](64 + $col))$row"
    if ($val -is [int] -or $val -is [long] -or $val -is [double] -or $val -is [decimal] -or $val -is [float]) {
        $ws.Range($addr).Formula = [string]$val
    } else {
        $ws.Range($addr).Value2 = $val
    }
}

# Header
if ($data.designerName) { SetCell $ws 6 2 (SanitizeStr $data.designerName) }
if ($data.employeeNum)  { SetCell $ws 4 11 (SanitizeStr $data.employeeNum)  }
SetCell $ws 6 11 ""
SetCell $ws 6 11 $data.weekEnding

# Clear all job rows (RT + OT)
$rtRows = 9,11,13,15,17,19,21,23,25,27
foreach ($rt in $rtRows) {
    $ot = $rt + 1
    foreach ($col in @(1,2,4,5,6,7,8,9,10,11,12)) {
        SetCell $ws $rt $col ""
        SetCell $ws $ot $col ""
    }
}

$maxJobs = [Math]::Min($jobs.Count, $rtRows.Count)
for ($i = 0; $i -lt $maxJobs; $i++) {
    $job = $jobs[$i]
    $rt  = $rtRows[$i]
    $ot  = $rt + 1

    SetCell $ws $rt 1 (SanitizeStr $job.number)
    SetCell $ws $rt 2 (SanitizeStr $job.name)
    SetCell $ws $ot 2 (SanitizeStr $(if ($job.costCode) { $job.costCode } else { "Overhead" }))

    $rtArr = @($job.rt); $otArr = @($job.ot)
    $rtTotal = 0;        $otTotal = 0

    for ($d = 0; $d -lt 7; $d++) {
        $col = $d + 4
        if ($rtArr[$d] -gt 0) { SetCell $ws $rt $col $rtArr[$d]; $rtTotal += $rtArr[$d] }
        if ($otArr[$d] -gt 0) { SetCell $ws $ot $col $otArr[$d]; $otTotal += $otArr[$d] }
    }
    if ($rtTotal -gt 0) { SetCell $ws $rt 11 $rtTotal }
    if ($otTotal -gt 0) { SetCell $ws $ot 12 $otTotal }
}

$specialMap = [ordered]@{ MTG=30; TRG=31; HOL=32; PTO=33; BRV=34 }
foreach ($code in $specialMap.Keys) {
    $row = $specialMap[$code]
    $hrs = @($data.special.$code)
    $tot = 0
    for ($d = 0; $d -lt 7; $d++) { SetCell $ws $row ($d + 4) "" }
    SetCell $ws $row 11 ""
    for ($d = 0; $d -lt 7; $d++) {
        if ($hrs[$d] -gt 0) { SetCell $ws $row ($d + 4) $hrs[$d]; $tot += $hrs[$d] }
    }
    if ($tot -gt 0) { SetCell $ws $row 11 $tot }
}

# Mileage (rows 40-43)
$mileageRows = 40,41,42,43
foreach ($mr in $mileageRows) {
    SetCell $ws $mr 1 ""
    SetCell $ws $mr 2 ""
    SetCell $ws $mr 5 0
}

$mileageEntries = @($data.mileage)
$maxMileage = [Math]::Min($mileageEntries.Count, $mileageRows.Count)
for ($i = 0; $i -lt $maxMileage; $i++) {
    $entry = $mileageEntries[$i]
    $mr    = $mileageRows[$i]
    SetCell $ws $mr 1 (SanitizeStr $entry.po)
    SetCell $ws $mr 2 (SanitizeStr $entry.description)
    SetCell $ws $mr 5 ([double]$entry.miles)
    $ws.Range("I$mr").Formula = "=E$mr*$([double]$entry.rate)"
}

# Expenses (rows 48-50)
$expenseRows = 48,49,50
foreach ($er in $expenseRows) {
    SetCell $ws $er 1 ""
    SetCell $ws $er 2 ""
    SetCell $ws $er 9 0
}

$expenseEntries = @($data.expenses)
$maxExpenses = [Math]::Min($expenseEntries.Count, $expenseRows.Count)
for ($i = 0; $i -lt $maxExpenses; $i++) {
    $entry  = $expenseEntries[$i]
    $er     = $expenseRows[$i]
    SetCell $ws $er 1 (SanitizeStr $entry.po)
    SetCell $ws $er 2 (SanitizeStr $entry.description)
    SetCell $ws $er 9 ([double]$entry.amount)
}

$datePart = $data.weekEnding -replace '/', '-'
$pdfPath  = (Split-Path $TemplatePath) + "\Timesheet-$datePart.pdf"

$wb.ExportAsFixedFormat(0, $pdfPath)
$wb.Close($false)
$excel.Quit()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null

Write-Host "Saved: $pdfPath"
Start-Process $pdfPath
