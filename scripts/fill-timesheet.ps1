param(
    [Parameter(Mandatory)][string]$JsonPath,
    [Parameter(Mandatory)][string]$TemplatePath
)

if (-not (Test-Path $JsonPath))    { Write-Error "JSON not found: $JsonPath";    exit 1 }
if (-not (Test-Path $TemplatePath)){ Write-Error "Template not found: $TemplatePath"; exit 1 }

$data = Get-Content $JsonPath -Raw | ConvertFrom-Json
$jobs = @($data.jobs)

$excel = New-Object -ComObject Excel.Application
$excel.Visible       = $false
$excel.DisplayAlerts = $false

$wb = $excel.Workbooks.Open($TemplatePath)
$ws = $wb.Worksheets.Item(1)

# .Value2 rejects Int32/Double on this Excel install; numeric values go through
# .Formula (as a string) which Excel stores as a number.
function SetCell($ws, $row, $col, $val) {
    $addr = "$([char](64 + $col))$row"
    if ($val -is [int] -or $val -is [long] -or $val -is [double] -or $val -is [decimal] -or $val -is [float]) {
        $ws.Range($addr).Formula = [string]$val
    } else {
        $ws.Range($addr).Value2 = $val
    }
}

# Clear week ending then set new value
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

    SetCell $ws $rt 1 "$($job.number)"
    SetCell $ws $rt 2 "$($job.name)"
    SetCell $ws $ot 2 $(if ($job.costCode) { $job.costCode } else { "Overhead" })

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

# ── Mileage (rows 40-43) ──────────────────────────────────────────────────
$mileageRows = 40,41,42,43
foreach ($mr in $mileageRows) {
    SetCell $ws $mr 1 ""   # P.O. / Job #
    SetCell $ws $mr 2 ""   # Description (merged B:D — write to B)
    SetCell $ws $mr 5 0    # Miles
}

$mileageEntries = @($data.mileage)
$maxMileage = [Math]::Min($mileageEntries.Count, $mileageRows.Count)
for ($i = 0; $i -lt $maxMileage; $i++) {
    $entry = $mileageEntries[$i]
    $mr    = $mileageRows[$i]
    $miles = [double]$entry.miles
    $rate  = [double]$entry.rate

    SetCell $ws $mr 1 "$($entry.po)"
    SetCell $ws $mr 2 "$($entry.description)"
    SetCell $ws $mr 5 $miles
    # Overwrite the extended-amount formula with the user's actual rate
    $amtAddr = "I$mr"
    $ws.Range($amtAddr).Formula = "=E$mr*$rate"
}

# ── Expenses (rows 48-50) ─────────────────────────────────────────────────
$expenseRows = 48,49,50
foreach ($er in $expenseRows) {
    SetCell $ws $er 1 ""   # P.O. / Job #
    SetCell $ws $er 2 ""   # Description (merged B:H — write to B)
    SetCell $ws $er 9 0    # Amount (merged I:L — write to I)
}

$expenseEntries = @($data.expenses)
$maxExpenses = [Math]::Min($expenseEntries.Count, $expenseRows.Count)
for ($i = 0; $i -lt $maxExpenses; $i++) {
    $entry  = $expenseEntries[$i]
    $er     = $expenseRows[$i]
    $amount = [double]$entry.amount

    SetCell $ws $er 1 "$($entry.po)"
    SetCell $ws $er 2 "$($entry.description)"
    SetCell $ws $er 9 $amount
}

$datePart   = $data.weekEnding -replace '/', '-'
$outputPath = (Split-Path $TemplatePath) + "\Timesheet-$datePart.xlsx"
$wb.SaveAs($outputPath, 51)
$wb.Close($false)
$excel.Quit()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null

Write-Host "Saved: $outputPath"
Start-Process $outputPath
